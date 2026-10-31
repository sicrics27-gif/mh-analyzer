// 구글 드라이브 동기화: 앱 전용 숨김 폴더(appDataFolder)에 '암호화된 그대로' 고객 자료를 올리고 받습니다.
// 내용은 잠금 비밀번호로 암호화되어 있어 구글도 읽을 수 없습니다.
(function (root) {
  var CFG = { webClientId: '__WEB_CLIENT_ID__' };
  var SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata';
  var CAL = 'https://www.googleapis.com/auth/calendar.app.created'; // 싯플랜 캘린더: 이 앱이 만든 캘린더만 다룸 (원하는 사람만 따로 허락)
  var DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var IS_DESKTOP = !!(root.__TAURI__ && root.__TAURI__.core && root.__TAURI__.core.invoke);
  function inv(cmd, args) { return root.__TAURI__.core.invoke(cmd, args || {}); }
  // 진짜 안드로이드 앱: 구글 로그인을 휴대폰 계정으로 (한 번 허락하면 그다음부터 화면 없이 자동)
  var NAT = root.Native && root.Native.on && root.Native.aob ? root.Native.aob : null;
  function natScopes(extra) { var s = SCOPE.split(' ').concat(extra ? extra.split(' ') : []); if (calOn() && s.indexOf(CAL) < 0) s.push(CAL); return s.filter(function (x, i) { return x && s.indexOf(x) === i; }); }
  function natErr(e) { var m = String(e && (e.code || e.message) || e); var er = new Error(m); if (/NEED_LOGIN/.test(m)) er.code = 'NEED_LOGIN'; else if (/DEVELOPER_ERROR/.test(m)) { er.code = 'CLIENT'; er.message = '이 앱의 구글 로그인 등록(안드로이드용)이 아직 안 되어 있습니다. 관리자에게 알려 주세요.'; } else if (/CANCELED/.test(m)) er.message = '로그인을 취소했습니다'; else if (/7:|network|NETWORK/i.test(m)) er.code = 'OFFLINE'; return er; }
  async function natAuth(interactive, extra) {
    try { var r = await NAT.gAuth({ scopes: natScopes(extra), interactive: !!interactive }); }
    catch (e) { throw natErr(e); }
    if (!r || !r.accessToken) { var e2 = new Error('NEED_LOGIN'); e2.code = 'NEED_LOGIN'; throw e2; }
    keepTok(r.accessToken, 3300); return r;
  }

  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  var state = ls('mhs_sync') || { on: false, last: 0 };
  function save() { ls('mhs_sync', state); }

  // ---------- 로그인 / 접근 토큰 ----------
  var tok = null, tokExp = 0, gisP = null, tc = null;
  function ss(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || 'null'); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function keepTok(t, sec) { tok = t; tokExp = Date.now() + (Math.max(120, +sec || 3600) - 60) * 1000; ss('mhs_tok', { t: tok, e: tokExp }); }
  (function () { var x = ss('mhs_tok'); if (x && x.t && x.e > Date.now()) { tok = x.t; tokExp = x.e; } })();
  // 휴대폰(설치한 앱)에서는 팝업 대신 '페이지 이동' 방식으로 로그인: 팝업 창이 따로 뜨거나 앱이 꺼지는 문제 방지
  function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function useRedirect() {
    if (IS_DESKTOP || NAT) return false;
    try { if (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) { }
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }
  function goAuth(prompt, purpose, extra) {
    var st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ls('mhs_oauth', { st: st, purpose: purpose, at: Date.now() });
    var q = { client_id: CFG.webClientId, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE + (extra ? ' ' + extra : ''), include_granted_scopes: 'true', state: st };
    if (prompt) q.prompt = prompt;
    var hint = ls('mhs_acct'); if (hint && !/select_account/.test(prompt || '')) q.login_hint = hint; // 계정이 여러 개여도 조용히 다시 로그인되게
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&'));
    return new Promise(function () { }); // 페이지가 넘어감
  }
  // 로그인하고 돌아왔을 때: 주소 뒤(#)의 결과 읽기
  var authResult = null;
  (function () {
    var h = String(location.hash || ''); if (!/access_token=|error=/.test(h)) return;
    var p = {}; h.replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    var pend = ls('mhs_oauth'); ls('mhs_oauth', null);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    if (!pend || p.state !== pend.st) return;
    if (p.access_token && pend.purpose === 'cal' && !/calendar/.test(p.scope || '')) { keepTok(p.access_token, p.expires_in); authResult = { ok: false, purpose: 'cal', error: 'cal_unchecked' }; }
    else if (p.access_token) { keepTok(p.access_token, p.expires_in); if (pend.purpose === 'connect' || pend.purpose === 'activate' || pend.purpose === 'cal') { state.on = true; save(); }
      if (pend.purpose === 'cal') ls('mhs_gcal', 1); authResult = { ok: true, purpose: pend.purpose }; }
    else authResult = { ok: false, purpose: pend.purpose, error: p.error || 'error' };
  })();
  function supported() {
    if (IS_DESKTOP) return true;
    if (/^__/.test(CFG.webClientId)) return false;
    return /^https:$/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.hostname);
  }
  function loadGis() {
    if (gisP) return gisP;
    gisP = new Promise(function (res, rej) {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) { res(); return; }
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { gisP = null; rej(new Error('구글 로그인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.appendChild(s);
    });
    return gisP;
  }
  // 웹: 반드시 버튼을 누른 직후에 호출 (팝업 차단 방지)
  function loginWeb(silent, purpose, extra) {
    if (NAT) return natAuth(!silent, extra).then(function (r) { if (extra && /calendar/.test(extra) && !(r.scopes || []).some(function (x) { return /calendar/.test(x); })) { var ce = new Error('cal_unchecked'); ce.code = 'CAL_UNCHECKED'; throw ce; } return tok; });
    if (useRedirect()) return goAuth(silent ? 'none' : (purpose === 'connect' || extra ? 'consent select_account' : 'select_account'), purpose || 'login', extra);
    return new Promise(function (res, rej) {
      var run = function () {
        tc = root.google.accounts.oauth2.initTokenClient({
          client_id: CFG.webClientId, scope: SCOPE + (extra ? ' ' + extra : ''), include_granted_scopes: true,
          callback: function (r) { if (r && r.access_token) { keepTok(r.access_token, r.expires_in); if (extra && !/calendar/.test(r.scope || '')) { var ce = new Error('cal_unchecked'); ce.code = 'CAL_UNCHECKED'; rej(ce); return; } res(tok); } else rej(new Error((r && r.error) || '로그인 취소')); },
          error_callback: function (e) { rej(new Error(e && e.type === 'popup_closed' ? '로그인 창이 닫혔습니다' : (e && e.message) || '로그인 실패')); }
        });
        var hint2 = ls('mhs_acct'); tc.requestAccessToken(Object.assign({ prompt: silent ? '' : 'consent' }, silent && hint2 ? { login_hint: hint2 } : {}));
      };
      if (root.google && root.google.accounts && root.google.accounts.oauth2) run();
      else loadGis().then(run, rej);
    });
  }
  async function token() {
    if (IS_DESKTOP) { try { return await inv('google_token'); } catch (e) { var m = String(e && e.message || e); var er = new Error(/NEED_LOGIN/.test(m) ? 'NEED_LOGIN' : 'PC 로그인 토큰 오류: ' + m); if (/NEED_LOGIN|invalid_grant/.test(m)) er.code = 'NEED_LOGIN'; else if (/dns|resolve|connect|timed out|network|os error/i.test(m)) er.code = 'OFFLINE'; else if (/invalid_client|unauthorized_client/.test(m)) er.code = 'CLIENT'; throw er; } }
    if (tok && Date.now() < tokExp) return tok;
    if (NAT && state.on) { await natAuth(false); return tok; } // 조용히 새 토큰 (화면 없음)
    var e = new Error('NEED_LOGIN'); e.code = 'NEED_LOGIN'; throw e;
  }
  async function connect() {
    if (IS_DESKTOP) { await inv('google_login'); }
    else { await loginWeb(false, 'connect'); }
    state.on = true; save();
  }
  // 잠금 해제 버튼을 누를 때 함께 호출: 웹은 조용히 토큰 받기
  function warm() { if (!state.on || IS_DESKTOP || NAT || !supported() || useRedirect()) return; if (tok && Date.now() < tokExp) return; loginWeb(true).catch(function () { }); }
  // 휴대폰: 앱을 열었는데 접근 토큰이 없으면 조용히 한 번 다녀오기(화면 표시 없이 1초 안팎). 실패하면 반복하지 않음
  function autoRefresh() {
    if (!state.on || !useRedirect() || !supported()) return false;
    if (tok && Date.now() < tokExp) return false;
    if (authResult && !authResult.ok) return false;
    var last = ss('mhs_auto') || 0; if (Date.now() - last < 10 * 60 * 1000) return false;
    ss('mhs_auto', Date.now()); goAuth('none', 'refresh'); return true;
  }
  async function disconnect() {
    if (IS_DESKTOP) { try { await inv('google_logout'); } catch (e) { } }
    else if (tok && root.google && root.google.accounts) { try { root.google.accounts.oauth2.revoke(tok, function () { }); } catch (e) { } }
    tok = null; tokExp = 0; ss('mhs_tok', null); state = { on: false, last: 0 }; save(); ls('mhs_synced', null);
  }

  // ---------- 드라이브 ----------
  // 구글 오류를 알아볼 수 있는 이유로 바꿈 (해결 방법 안내용)
  function gErr(status, j) {
    var er = (j && j.error) || {}, reason = ((er.errors || [])[0] || {}).reason || er.status || '', msg = er.message || '';
    var det = (er.details || []).map(function (d) { return d.reason || ''; }).join(' ');
    var e = new Error('구글 오류 ' + status + (reason ? ' (' + reason + ')' : '') + (msg ? ': ' + msg : ''));
    e.status = status; e.reason = reason; e.raw = msg;
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + ' ' + det + ' ' + msg) || /has not been used in project|is disabled/i.test(msg)) {
      e.code = 'API_OFF'; var m = msg.match(/project\s+(\d+)/); e.project = m ? m[1] : '';
    } else if (/insufficient|SCOPE/i.test(reason + ' ' + det + ' ' + msg)) e.code = 'SCOPE';
    else if (status === 429 || status >= 500 || /rateLimit|userRateLimit|backendError/i.test(reason)) e.code = 'RETRY';
    else if (status === 404) e.code = 'NOT_FOUND';
    return e;
  }
  async function api(url, opt, tries) {
    var t = await token();
    var o = Object.assign({}, opt || {}); o.headers = Object.assign({ Authorization: 'Bearer ' + t }, (opt && opt.headers) || {});
    var r;
    try { r = await fetch(url, o); }
    catch (e0) { var ne = new Error('인터넷 연결 없음'); ne.code = 'OFFLINE'; throw ne; }
    if (r.status === 401) { tok = null; ss('mhs_tok', null); var e = new Error('NEED_LOGIN'); e.code = 'NEED_LOGIN'; throw e; }
    if (!r.ok) {
      var j = null; try { j = await r.json(); } catch (e1) { }
      var ge = gErr(r.status, j);
      if (ge.code === 'SCOPE' && o._cal) { ge.code = 'NEED_CAL'; throw ge; }
      if (ge.code === 'SCOPE') { tok = null; ss('mhs_tok', null); ge.code = 'NEED_LOGIN'; }
      if (ge.code === 'RETRY' && (tries || 0) < 3) { await new Promise(function (res) { setTimeout(res, 800 * Math.pow(2, tries || 0)); }); return api(url, opt, (tries || 0) + 1); }
      throw ge;
    }
    return r;
  }
  async function listFiles() {
    var out = [], page = '';
    do {
      var r = await api(DRIVE + '?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,appProperties)' + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
      var j = await r.json(); out = out.concat(j.files || []); page = j.nextPageToken || '';
    } while (page);
    return out;
  }
  function multipart(meta, body) {
    var b = 'mhs' + Math.random().toString(36).slice(2);
    return { type: 'multipart/related; boundary=' + b, body: '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--' };
  }
  async function upload(fileId, name, props, body) {
    var meta = fileId ? { appProperties: props } : { name: name, parents: ['appDataFolder'], appProperties: props };
    var m = multipart(meta, body);
    try {
      var r = await api((fileId ? UPLOAD + '/' + fileId : UPLOAD) + '?uploadType=multipart&fields=id', { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': m.type }, body: m.body });
      return (await r.json()).id;
    } catch (e) { if (fileId && e.code === 'NOT_FOUND') return upload(null, name, props, body); throw e; }
  }
  async function download(fileId) { return (await api(DRIVE + '/' + fileId + '?alt=media')).text(); }

  // ---------- 동기화 ----------
  var running = null, listeners = [];
  function emit(s) { listeners.forEach(function (f) { try { f(s); } catch (e) { } }); }
  // 마지막으로 맞춘 시점(기록별): 양쪽 모두 바뀐 경우를 알아내 합치기 위해
  function syncedMap(v) { if (v) ls('mhs_synced', v); return ls('mhs_synced') || {}; }
  async function remoteVault() {
    var files = await listFiles(), f = files.find(function (x) { return x.name === 'vault.json'; });
    return f ? JSON.parse(await download(f.id)) : null;
  }
  // 결과: {status:'ok', up, down, changed} | {status:'needPin', remoteVault} | {status:'needLogin'} | {status:'offline'} | {status:'error', message}
  async function run(opts) {
    if (running) return running;
    running = (async function () {
      emit({ status: 'running' });
      try {
        var files = await listFiles();
        var byName = {}; files.forEach(function (f) { byName[f.name] = f; });
        var local = await Store.vault();
        if (!byName['vault.json']) {
          await upload(null, 'vault.json', { salt: local.salt }, JSON.stringify(local));
        } else {
          var rv = byName['vault.json'];
          if (!rv.appProperties || rv.appProperties.salt !== local.salt) {
            var remote = JSON.parse(await download(rv.id));
            if (remote.salt !== local.salt) {
              if (opts && opts.pin) { if (!(await Store.adoptVault(remote, opts.pin))) return { status: 'badPin' }; }
              else return { status: 'needPin', remoteVault: remote };
            }
          }
        }
        var mine = await Store.rawAll(), up = 0, down = 0, last = syncedMap();
        var mineById = {}; mine.forEach(function (x) { mineById[x.id] = x; });
        var changedIds = [], handled = {};
        // 받기 (양쪽 다 바뀌었으면 합치기) — 여러 건을 동시에 받아 빠르게
        var jobs = [];
        files.forEach(function (f) {
          var m = /^c_(.+)\.json$/.exec(f.name); if (!m) return;
          var id = m[1], ru = +((f.appProperties || {}).u || 0), lx = mineById[id], seen = +(last[id] || 0);
          if (lx && ru === lx.updated) { last[id] = ru; return; }
          if (!lx || ru > lx.updated || (lx.updated > seen && ru > seen)) jobs.push(async function () {
            var o = JSON.parse(await download(f.id));
            try {
              if (lx && lx.updated > seen && ru > seen) { await Store.mergeRemote(id, o.h, o.d || null); handled[id] = 'merged'; }
              else if (!lx || ru > lx.updated) { await Store.putRaw(id, o.h, o.d || null); last[id] = ru; handled[id] = 'down'; }
              down++; changedIds.push(id);
            } catch (e) { }
          });
        });
        await pool(jobs, 8);
        // 올리기
        mine = await Store.rawAll();
        var ups = [];
        mine.forEach(function (x0) { ups.push(async function () {
          var x = x0, rf = byName['c_' + x.id + '.json'], rup = rf ? +((rf.appProperties || {}).u || 0) : -1;
          if (handled[x.id] === 'down') return;
          // 지난번 맞춘 뒤 다른 기기가 그 사이 올린 게 있으면 덮어쓰지 말고 먼저 합치기
          if (rf && x.updated > rup && handled[x.id] !== 'merged' && rup !== +(last[x.id] || 0)) {
            try { var o2 = JSON.parse(await download(rf.id)); await Store.mergeRemote(x.id, o2.h, o2.d || null); changedIds.push(x.id); down++;
              x = (await Store.rawAll()).find(function (y) { return y.id === x.id; }) || x; } catch (e) { }
          }
          if (x.updated > rup) {
            var d = x.deleted ? null : await Store.rawData(x.id);
            await upload(rf ? rf.id : null, 'c_' + x.id + '.json', { u: String(x.updated) }, JSON.stringify({ h: x.head, d: d || null }));
            last[x.id] = x.updated; up++;
          }
        }); });
        await pool(ups, 5);
        syncedMap(last);
        state.last = Date.now(); save();
        var res = { status: 'ok', up: up, down: down, changed: changedIds };
        emit(res); return res;
      } catch (e) {
        var r2 = e && e.code === 'NEED_LOGIN' ? { status: 'needLogin' } : (e && e.code === 'OFFLINE' || e instanceof TypeError || !navigator.onLine) ? { status: 'offline' } : { status: 'error', code: e && e.code || '', project: e && e.project || '', message: e && e.message || String(e) };
        state.lastErr = r2.message || r2.status; state.lastErrAt = Date.now(); save();
        if (r2.status !== 'needLogin') { clearTimeout(t); t = setTimeout(function () { if (Store.isOpen()) run(); }, r2.status === 'offline' ? 15000 : 45000); }
        emit(r2); return r2;
      } finally { running = null; }
    })();
    return running;
  }
  // 동시에 n개씩 처리 (하나가 실패하면 전체 실패 — 다음 동기화 때 다시 시도)
  async function pool(jobs, n) {
    var i = 0, err = null;
    async function worker() { while (i < jobs.length && !err) { var j = jobs[i++]; try { await j(); } catch (e) { err = e; } } }
    var ws = []; for (var k = 0; k < Math.min(n, jobs.length); k++) ws.push(worker());
    await Promise.all(ws); if (err) throw err;
  }
  var t = null;
  function soon(ms) { if (!state.on) return; clearTimeout(t); t = setTimeout(function () { if (Store.isOpen()) run(); }, ms || 1500); }

  // ---------- 구글 캘린더 (싯플랜 자동 맞추기) ----------
  function calOn(v) { if (v !== undefined) ls('mhs_gcal', v ? 1 : null); return !!ls('mhs_gcal'); }
  async function calLogin() {
    if (IS_DESKTOP) await inv('google_login', { cal: true });
    else await loginWeb(false, 'cal', CAL);
    state.on = true; save(); calOn(true);
  }
  async function gapi(url, opt) { var o = Object.assign({ _cal: 1 }, opt || {}); return api(url, o); }

  // 로그인한 구글 계정 이메일 (사용 권한 본인 확인용)
  async function userEmail() {
    var r = await api('https://www.googleapis.com/oauth2/v3/userinfo');
    var j = await r.json(); if (!j.email) throw new Error('이메일을 확인하지 못했습니다'); return String(j.email).toLowerCase();
  }
  async function loginForEmail() {
    if (IS_DESKTOP) await inv('google_login'); else await loginWeb(false, 'activate');
    state.on = true; save();
    var em = await userEmail(); ls('mhs_acct', em); return em;
  }
  // 이 기기에 연결된 구글 계정 (이메일)
  function account(v) { if (v !== undefined) ls('mhs_acct', v); return ls('mhs_acct') || ''; }
  function hasToken() { return (IS_DESKTOP || NAT) ? state.on : !!(tok && Date.now() < tokExp); }
  root.Sync = { userEmail: userEmail, loginForEmail: loginForEmail,
    cfg: CFG, supported: supported, isOn: function () { return !!state.on; }, last: function () { return state.last; },
    isDesktop: IS_DESKTOP, isNative: !!NAT, connect: connect, disconnect: disconnect, warm: warm, run: run, soon: soon,
    loginWeb: loginWeb, on: function (f) { listeners.push(f); }, remoteVault: remoteVault, account: account, hasToken: hasToken, autoRefresh: autoRefresh, useRedirect: useRedirect,
    authResult: function () { var r = authResult; return r; }, redirectUri: redirectUri,
    calLogin: calLogin, calOn: calOn, gapi: gapi
  };
})(this);
