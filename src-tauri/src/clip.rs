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
