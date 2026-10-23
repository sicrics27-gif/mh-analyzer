// 콘솔 창 없이 실행
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("병력고지 분석기를 실행하지 못했습니다");
}
