// 콘솔 창 없이 실행
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod google;
use base64::Engine;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const UNLOCK_PS1: &str = r#"param([string]$i,[string]$o,[string]$p)
$ErrorActionPreference = 'Stop'
try { $x = New-Object -ComObject Excel.Application } catch { exit 2 }
$x.Visible = $false; $x.DisplayAlerts = $false
$wb = $null
foreach ($pw in $p.Split(',')) { if ($pw) { try { $wb = $x.Workbooks.Open($i, 0, $true, 5, $pw); break } catch { $wb = $null } } }
if (-not $wb) { $x.Quit(); exit 3 }
$wb.SaveAs($o, 51, '')
$wb.Close($false)
$x.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($x) | Out-Null
exit 0
"#;

/// 잠긴 투약이력 엑셀을 이 PC에 설치된 Microsoft Excel로 열어 암호 없는 xlsx로 바꿔 돌려줍니다.
/// 임시 파일은 끝나면 바로 지웁니다.
#[tauri::command]
fn unlock_excel(data: String, passwords: Vec<String>) -> Result<String, String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let bytes = b64.decode(data.as_bytes()).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("mha-{}-{}", std::process::id(), stamp));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let inp = dir.join("in.xls");
    let out = dir.join("out.xlsx");
    let ps1 = dir.join("unlock.ps1");
    let result = (|| -> Result<String, String> {
        std::fs::write(&inp, &bytes).map_err(|e| e.to_string())?;
        let mut script = vec![0xEF, 0xBB, 0xBF];
        script.extend_from_slice(UNLOCK_PS1.as_bytes());
        std::fs::write(&ps1, &script).map_err(|e| e.to_string())?;
        let pw: Vec<String> = passwords.into_iter().filter(|s| !s.contains(',')).collect();
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ps1).arg("-i").arg(&inp).arg("-o").arg(&out).arg("-p").arg(pw.join(","));
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let st = cmd.status().map_err(|e| e.to_string())?;
        match st.code() {
            Some(0) => {}
            Some(2) => return Err("NOEXCEL".into()),
            Some(3) => return Err("BADPW".into()),
            other => return Err(format!("FAIL {:?}", other)),
        }
        let res = std::fs::read(&out).map_err(|e| e.to_string())?;
        Ok(b64.encode(res))
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![unlock_excel, google::google_login, google::google_token, google::google_logout, google::open_url])
        .run(tauri::generate_context!())
        .expect("병력고지 분석기를 실행하지 못했습니다");
}
