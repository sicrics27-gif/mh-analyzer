# AOB9 (예전 이름 AOB · AFG OC9) — 이 저장소에서 일하는 Claude 안내서

오너: 강남혁 대표님(보험설계사, AFG Ocean Branch 9팀). 개발 비전문가 → 결과는 쉬운 한국어로 보고.

## ⚠️ 가장 중요: 원본은 `aob-src/` 하나뿐
- 화면·기능 코드의 **원본은 `aob-src/src/`** 입니다 (`ui.js` 화면 대부분, `style.css`, `body.html`, `nhc.js`, `native.js` …).
- `pwa/index.html` · `web/index.html` 은 **만들어진 결과물**입니다. **절대 직접 고치지 마세요.**
  직접 고치면 다음 빌드 때 그대로 지워집니다. (2026-10-31: 여러 대화가 결과물을 직접 고쳐서 서로의 작업을 지운 사고가 있었음)
- 고친 뒤 반드시:
  ```
  python3 aob-src/build.py --install   # aob-src → pwa/ · web/ 에 결과 넣기
  python3 aob-src/build.py --check     # 결과물이 원본과 같은지 확인 (배포 워크플로도 이 검사를 함)
  ```
- 시작 전 `git pull` 로 최신을 받고, 커밋 직전에도 다시 `git pull --rebase` 합니다.

## 구조
- `aob-src/` 웹 화면 원본 + `build.py`(합쳐서 한 파일로 만듦) + `static/`(설치 안내 페이지 app.html·아이콘·Apps Script 코드) + (시험 스크립트는 개인정보 예시가 섞일 수 있어 저장소에 넣지 않음)
- `app-android/` 안드로이드 앱 껍데기(Capacitor). 패키지 `io.github.sicrics27gif.oc9` 은 바꾸지 않음. 서명 열쇠는 금고(GitHub Secrets)
- `src-tauri/` 윈도우 프로그램 껍데기 (id `kr.oceanbranch.mhanalyzer` 바꾸지 않음)
- `access.json` OTP(입장 코드) 목록 — 앱의 관리자 화면이 고침
- 워크플로: 고칠 때마다 자동 배포하지 않음. `deploy.yml`(대표님 "배포해" 또는 매일 03:47)이 바뀐 것만 `pages.yml`·`build-windows.yml`·`build-android.yml` 실행

## 반드시 지킬 것
1. 고객 개인정보(이름+연락처, 주민번호, 병력, 상세 주소)를 저장소에 넣거나 무료 AI·확인 안 된 외부 사이트로 보내지 않는다. (공개 저장소!)
2. API 키·토큰은 파일에 쓰지 않는다. 금고(GitHub Secrets) 이름만 정해 대표님께 요청.
3. 플랫폼 약관 위반(카톡 매크로·자동화 우회 등) 기능은 만들지 않는다.
4. 고친 뒤 `cd aob-src/dist/pwa && python3 -m http.server 8765` 로 띄워 화면을 직접 확인한다 (Playwright 등).
5. 배포는 대표님이 "배포해" 하실 때 한 번에. 급한 사고 복구만 예외.
