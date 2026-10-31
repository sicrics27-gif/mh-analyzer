// 사용 권한(OTP): 관리자가 발급한 코드가 있는 사람만 프로그램을 씀.
// 허용 목록은 관리자 GitHub 저장소의 access.json (코드·이메일은 알아볼 수 없게 바꾼 값만 저장).
(function (root) {
  var REPO = 'sicrics27-gif/mh-analyzer', PATH = 'access.json';
  var te = new TextEncoder(), td = new TextDecoder();
  var ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  async function sha(s) { var b = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, 24); }
  function norm(c) { var s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (/^MH/.test(s) && s.length === 18) s = s.slice(2); return s.length === 16 ? 'MH-' + s.match(/.{4}/g).join('-') : ''; }
  function newCode() { var r = crypto.getRandomValues(new Uint8Array(16)), s = ''; for (var i = 0; i < 16; i++) s += ALPH[r[i] % 32]; return 'MH-' + s.match(/.{4}/g).join('-'); }
  function codeHash(c) { return sha('mhc:' + norm(c)); }
  function mailHash(e) { return sha('mhs:' + String(e || '').trim().toLowerCase()); }
  function b64dec(b) { var bin = atob(String(b).replace(/\s/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return td.decode(u); }
  function b64enc(s) { var u = te.encode(s), bin = ''; for (var i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }
  function skip() { return !!root.claude || /claude\.ai|claudeusercontent/.test(location.hostname || ''); }

  // 허용 목록 받기 (항상 인터넷에서 새로)
  async function fetchList() {
    var urls = [
      { u: 'https://api.github.com/repos/' + REPO + '/contents/' + PATH + '?ref=main&t=' + Date.now(), h: { Accept: 'application/vnd.github.raw' } },
      { u: 'https://raw.githubusercontent.com/' + REPO + '/main/' + PATH + '?t=' + Date.now(), h: {} }
    ];
    var last = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i].u, { cache: 'no-store', headers: urls[i].h });
        if (r.status === 404) return { v: 1, on: false, users: {} };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json(); if (!j.users) j.users = {}; return j;
      } catch (e) { last = e; }
    }
    var er = new Error('OFFLINE'); er.code = 'OFFLINE'; er.cause = last; throw er;
  }
  // 이 기기의 권한 상태: off(코드 기능 꺼짐) | ok | need(코드 없음) | revoked(정지·삭제) | offline
  async function check() {
    if (skip()) return { state: 'off' };
    var list; try { list = await fetchList(); } catch (e) { return { state: 'offline' }; }
    if (!list.on) return { state: 'off', list: list };
    var lic = ls('mhs_lic');
    if (!lic) return { state: 'need', list: list };
    var u = list.users[lic.c];
    if (!u || u.s !== 1 || u.e !== lic.e) return { state: 'revoked', list: list, removed: !u };
    return { state: 'ok', list: list };
  }
  // 코드 확인 (1단계): 목록에 있고 사용 중인지
  async function lookup(code) {
    var c = norm(code); if (!c) return { error: 'format' };
    var list = await fetchList(), h = await codeHash(c), u = list.users[h];
    if (!u) return { error: 'unknown' };
    if (u.s !== 1) return { error: 'revoked' };
    return { c: h, e: u.e };
  }
  // 코드 + 구글 이메일 일치 확인 (2단계) → 이 기기에 등록
  async function activate(pend, email) {
    if (email !== null && (await mailHash(email)) !== pend.e) return false;
    ls('mhs_lic', { c: pend.c, e: pend.e, at: Date.now() }); ls('mhs_lic_pend', null); return true;
  }

  // ---------- 관리자: GitHub 목록 고치기 ----------
  function gh(token, path, opt) {
    opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opt.headers || {});
    return fetch('https://api.github.com' + path, opt);
  }
  async function verifyToken(token) {
    var r = await gh(token, '/repos/' + REPO);
    if (r.status === 401) throw new Error('토큰이 올바르지 않거나 만료되었습니다');
    if (!r.ok) throw new Error('저장소에 접근할 수 없습니다 (' + r.status + ')');
    var j = await r.json(); if (!(j.permissions && j.permissions.push)) throw new Error('이 토큰에는 쓰기 권한(Contents: Read and write)이 없습니다');
    return true;
  }
  async function readAdmin(token) {
    var r = await gh(token, '/repos/' + REPO + '/contents/' + PATH + '?ref=main&t=' + Date.now(), { cache: 'no-store' });
    if (r.status === 404) return { sha: null, list: { v: 1, on: false, users: {} } };
    if (!r.ok) throw new Error('목록을 읽지 못했습니다 (' + r.status + ')');
    var j = await r.json(), list = JSON.parse(b64dec(j.content)); if (!list.users) list.users = {};
    return { sha: j.sha, list: list };
  }
  // fn(list) 로 고친 뒤 저장 (동시에 고친 경우 한 번 다시 시도)
  async function edit(token, fn, msg) {
    for (var t = 0; t < 2; t++) {
      var cur = await readAdmin(token); fn(cur.list); cur.list.v = 1; cur.list.updated = new Date().toISOString();
      var body = { message: msg || '사용자 권한 변경', content: b64enc(JSON.stringify(cur.list, null, 1) + '\n'), branch: 'main' };
      if (cur.sha) body.sha = cur.sha;
      var r = await gh(token, '/repos/' + REPO + '/contents/' + PATH, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) return cur.list;
      if (r.status !== 409 && r.status !== 422) throw new Error('저장하지 못했습니다 (' + r.status + ')');
    }
    throw new Error('저장하지 못했습니다. 잠시 후 다시 시도하세요');
  }

  root.Access = { REPO: REPO, check: check, lookup: lookup, activate: activate, fetchList: fetchList, newCode: newCode, norm: norm, codeHash: codeHash, mailHash: mailHash,
    verifyToken: verifyToken, readAdmin: readAdmin, edit: edit, lic: function () { return ls('mhs_lic'); }, setLic: function (v) { ls('mhs_lic', v); },
    pend: function (v) { return ls('mhs_lic_pend', v); }, skip: skip };
})(this);
