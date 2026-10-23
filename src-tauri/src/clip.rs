// SMemo 연동(복사 감지): 클립보드에 '이름 + 주민번호 앞자리' 형태의 메모가 복사되면 화면에 알려 줍니다.
// 그 밖의 복사 내용은 보내지 않고, 아무것도 저장하지 않습니다.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Emitter;

static ON: AtomicBool = AtomicBool::new(true);

fn looks_like_customer(t: &str) -> bool {
    if t.len() > 200_000 { return false; }
    let b = t.as_bytes();
    let mut i = 0;
    while i + 8 <= b.len() {
        if (i == 0 || !b[i - 1].is_ascii_digit()) && b[i..i + 6].iter().all(|c| c.is_ascii_digit()) {
            let mut j = i + 6;
            while j < b.len() && b[j] == b' ' { j += 1; }
            if j < b.len() && b[j] == b'-' {
                j += 1;
                while j < b.len() && b[j] == b' ' { j += 1; }
                if j < b.len() && (b'1'..=b'8').contains(&b[j]) { return true; }
            }
        }
        i += 1;
    }
    false
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut cb = match arboard::Clipboard::new() { Ok(c) => c, Err(_) => return };
        let mut last = String::new();
        let mut first = true;
        loop {
            std::thread::sleep(Duration::from_millis(900));
            let t = match cb.get_text() { Ok(t) => t, Err(_) => continue };
            if t == last { continue; }
            last = t.clone();
            if first { first = false; continue; } // 프로그램을 켜기 전에 복사해 둔 내용은 무시
            if ON.load(Ordering::Relaxed) && looks_like_customer(&t) { let _ = app.emit("memo-copied", t); }
        }
    });
}

#[tauri::command]
pub fn clip_watch(on: bool) { ON.store(on, Ordering::Relaxed); }

/// SMemo 백업: 기본 백업 폴더에서 가장 최근 ZIP을 찾아 그대로 돌려줍니다 (이름 + base64).
#[tauri::command]
pub fn smemo_latest() -> Result<(String, String), String> {
    use base64::Engine;
    let dirs = [r"C:\SMYSoft\SMemo\system\backup", r"C:\Program Files (x86)\SMYSoft\SMemo\system\backup", r"C:\Program Files\SMYSoft\SMemo\system\backup"];
    let mut best: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for d in dirs.iter() {
        if let Ok(rd) = std::fs::read_dir(d) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().map(|x| x.eq_ignore_ascii_case("zip")).unwrap_or(false) {
                    if let Ok(m) = e.metadata().and_then(|m| m.modified()) {
                        if best.as_ref().map(|b| m > b.0).unwrap_or(true) { best = Some((m, p)); }
                    }
                }
            }
        }
    }
    let (_, p) = best.ok_or("SMemo 백업 파일을 찾지 못했습니다. SMemo에서 먼저 백업하기를 눌러 주세요.")?;
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok((name, base64::engine::general_purpose::STANDARD.encode(bytes)))
}
