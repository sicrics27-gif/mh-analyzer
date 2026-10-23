// 구글 로그인(PC 프로그램): 기본 브라우저로 로그인 → 이 PC의 임시 주소(127.0.0.1)로 결과 받기 (PKCE)
use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

include!("google_cfg.rs");
const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";

static TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
fn rand_str(n: usize) -> String {
    const CS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut buf = vec![0u8; n];
    getrandom::getrandom(&mut buf).expect("random");
    buf.iter().map(|b| CS[(*b as usize) % CS.len()] as char).collect()
}
fn enc(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
        _ => format!("%{:02X}", b),
    }).collect()
}
fn dec(s: &str) -> String {
    let b = s.as_bytes(); let mut out = Vec::new(); let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() { if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; } }
        out.push(if b[i] == b'+' { b' ' } else { b[i] }); i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
fn store_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join("google.json"))
}
fn open_browser(url: &str) {
    #[cfg(windows)]
    { let _ = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn(); }
    #[cfg(not(windows))]
    { let _ = std::process::Command::new("xdg-open").arg(url).spawn(); }
}
fn token_request(form: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    match ureq::post("https://oauth2.googleapis.com/token").send_form(form) {
        Ok(r) => r.into_json::<serde_json::Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(_, r)) => Err(r.into_string().unwrap_or_default()),
        Err(e) => Err(e.to_string()),
    }
}

fn login_blocking(app: tauri::AppHandle) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{}", port);
    let verifier = rand_str(64);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = rand_str(24);
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        enc(DESKTOP_CLIENT_ID), enc(&redirect), enc(SCOPE), challenge, state
    );
    open_browser(&url);
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let start = Instant::now();
    let (code, mut stream) = loop {
        if start.elapsed() > Duration::from_secs(300) { return Err("로그인 시간이 지났습니다. 다시 시도하세요.".into()); }
        match listener.accept() {
            Ok((mut s, _)) => {
                s.set_nonblocking(false).ok();
                s.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut buf = [0u8; 8192]; let n = s.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let path = req.split_whitespace().nth(1).unwrap_or("").to_string();
                let q = path.splitn(2, '?').nth(1).unwrap_or("");
                let mut code = String::new(); let mut st = String::new(); let mut err = String::new();
                for kv in q.split('&') {
                    let mut it = kv.splitn(2, '='); let k = it.next().unwrap_or(""); let v = dec(it.next().unwrap_or(""));
                    match k { "code" => code = v, "state" => st = v, "error" => err = v, _ => {} }
                }
                if !err.is_empty() { let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<h2>로그인이 취소되었습니다. 이 창을 닫으세요.</h2>"); return Err(format!("로그인 취소 ({})", err)); }
                if code.is_empty() || st != state { let _ = write!(s, "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); continue; }
                break (code, s);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(200)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<html><body style=\"font-family:sans-serif;text-align:center;padding-top:80px\"><h2>구글 계정 연결 완료</h2><p>이 창은 닫으셔도 됩니다. 병력고지 분석기가 앞으로 나와 자동으로 이어집니다.</p><script>setTimeout(function(){window.close()},1500)</script></body></html>");
    drop(stream);
    let j = token_request(&[("code", &code), ("client_id", DESKTOP_CLIENT_ID), ("client_secret", DESKTOP_CLIENT_SECRET), ("redirect_uri", &redirect), ("grant_type", "authorization_code"), ("code_verifier", &verifier)])?;
    let access = j["access_token"].as_str().ok_or("토큰을 받지 못했습니다")?.to_string();
    let exp = now() + j["expires_in"].as_u64().unwrap_or(3600).saturating_sub(60);
    if let Some(rt) = j["refresh_token"].as_str() {
        std::fs::write(store_path(&app)?, serde_json::json!({ "refresh_token": rt }).to_string()).map_err(|e| e.to_string())?;
    }
    *TOKEN.lock().unwrap() = Some((access, exp));
    if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_always_on_top(true); let _ = w.set_focus(); let _ = w.set_always_on_top(false); }
    Ok(())
}

#[tauri::command]
pub async fn google_login(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || login_blocking(app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn google_token(app: tauri::AppHandle) -> Result<String, String> {
    if let Some((t, exp)) = TOKEN.lock().unwrap().clone() { if now() < exp { return Ok(t); } }
    let p = store_path(&app)?;
    let txt = std::fs::read_to_string(&p).map_err(|_| "NEED_LOGIN".to_string())?;
    let v: serde_json::Value = serde_json::from_str(&txt).map_err(|_| "NEED_LOGIN".to_string())?;
    let rt = v["refresh_token"].as_str().ok_or("NEED_LOGIN")?.to_string();
    let j = tauri::async_runtime::spawn_blocking(move || token_request(&[("refresh_token", &rt), ("client_id", DESKTOP_CLIENT_ID), ("client_secret", DESKTOP_CLIENT_SECRET), ("grant_type", "refresh_token")]))
        .await.map_err(|e| e.to_string())?
        .map_err(|e| if e.contains("invalid_grant") { "NEED_LOGIN".to_string() } else { e })?;
    let access = j["access_token"].as_str().ok_or("NEED_LOGIN")?.to_string();
    let exp = now() + j["expires_in"].as_u64().unwrap_or(3600).saturating_sub(60);
    *TOKEN.lock().unwrap() = Some((access.clone(), exp));
    Ok(access)
}

#[tauri::command]
pub fn google_logout(app: tauri::AppHandle) -> Result<(), String> {
    *TOKEN.lock().unwrap() = None;
    if let Ok(p) = store_path(&app) { let _ = std::fs::remove_file(p); }
    Ok(())
}

/// 바로가기: https 주소만 기본 브라우저로 엽니다.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.contains(' ') || url.contains('"') { return Err("허용되지 않는 주소".into()); }
    open_browser(&url);
    Ok(())
}
