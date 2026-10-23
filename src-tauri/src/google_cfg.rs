// 구글 클라이언트 정보 — 빌드할 때 GitHub 비밀 설정(GOOGLE_DESKTOP_SECRET)에서 채워 넣습니다.
const DESKTOP_CLIENT_ID: &str = "406779183746-5cq3m5s2d473pfb8nfpef1vi7uimth8p.apps.googleusercontent.com";
const DESKTOP_CLIENT_SECRET: &str = match option_env!("GOOGLE_DESKTOP_SECRET") { Some(s) => s, None => "" };
