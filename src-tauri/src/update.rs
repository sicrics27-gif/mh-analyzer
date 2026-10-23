// 새 버전 알림 + 원클릭 업데이트: GitHub 최신 릴리스의 exe를 받아 지금 실행 중인 exe와 바꾼 뒤 다시 켭니다.
use std::io::Read;

const LATEST_EXE: &str = "https://github.com/sicrics27-gif/mh-analyzer/releases/latest/download/MH-Analyzer.exe";

#[tauri::command]
pub fn app_build() -> u32 { option_env!("APP_BUILD").and_then(|s| s.parse().ok()).unwrap_or(0) }

fn old_path() -> Option<std::path::PathBuf> { std::env::current_exe().ok().map(|p| p.with_extension("old.exe")) }

/// 지난 업데이트 때 남은 이전 파일 정리
pub fn cleanup() { if let Some(o) = old_path() { let _ = std::fs::remove_file(o); } }

fn download() -> Result<Vec<u8>, String> {
    let r = ureq::get(LATEST_EXE).call().map_err(|e| format!("새 버전을 받지 못했습니다: {}", e))?;
    let mut buf = Vec::new();
    r.into_reader().take(150 * 1024 * 1024).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    if buf.len() < 1_000_000 || &buf[..2] != b"MZ" { return Err("받은 파일이 올바른 프로그램이 아닙니다.".into()); }
    Ok(buf)
}

#[tauri::command]
pub async fn update_now(app: tauri::AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bytes = tauri::async_runtime::spawn_blocking(download).await.map_err(|e| e.to_string())??;
    let old = old_path().ok_or("경로 오류")?;
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).map_err(|e| format!("프로그램 파일을 바꿀 수 없습니다: {}", e))?;
    if let Err(e) = std::fs::write(&exe, &bytes) {
        let _ = std::fs::rename(&old, &exe);
        return Err(format!("새 버전을 저장하지 못했습니다: {}", e));
    }
    std::process::Command::new(&exe).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}
