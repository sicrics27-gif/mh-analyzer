// AOB9 · 9팀 팀 서버 (리그전 + 건의사항·오류 신고(자동 개선) + MD's PICK + OTP 요청) · 버전 2026-10-31 — 구글 Apps Script, 관리자(강남혁) 구글 계정에서 한 번 배포
// 저장하는 것: 리그(별명·주간 숫자), 건의사항(이름·제목·내용·상태·답변). 고객 정보는 받지 않습니다.
// OTP가 '사용 중'인 사람만 글을 올릴 수 있습니다 (access.json 확인). 건의사항 검토는 관리자 열쇠가 있어야 합니다.
const ACCESS = 'https://raw.githubusercontent.com/sicrics27-gif/mh-analyzer/main/access.json';
function allowed(c) {
  if (!c || !/^[0-9a-f]{24}$/.test(c)) return false;
  const cache = CacheService.getScriptCache();
  let j = cache.get('acc');
  if (!j) { j = UrlFetchApp.fetch(ACCESS + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText(); cache.put('acc', j, 300); }
  try { const a = JSON.parse(j); const u = (a.users || {})[c]; return !!(u && u.s === 1); } catch (e) { return false; }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props() { return PropertiesService.getScriptProperties(); }
function isAdmin(k) { const a = props().getProperty('ADMIN_KEY'); return !!(a && k && k === a); }

// ---------- 건의사항: 관리자 구글 드라이브의 시트 'AOB 건의사항'에 저장 ----------
const COLS = ['id', 'at', 'c', 'n', 'title', 'desc', 'st', 'reply', 'rat', 'likes', 'kind', 'img', 'diag', 'fix', 'pr', 'fsum', 'ft'];
// ---------- 오류·개선 신고 → GitHub 자동 개선 (2026-10-31) ----------
// 캡처 사진은 관리자 구글 드라이브 'AOB 오류 캡처' 폴더에만 저장(공개 안 함). 신고가 들어오면 GitHub 에 알림 → Claude 가 고친 안(PR)을 만듦
const REPO = 'sicrics27-gif/mh-analyzer';
function shotFolder() {
  const p = props(); let id = p.getProperty('SHOT_DIR'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFolder('AOB 오류 캡처'); p.setProperty('SHOT_DIR', f.getId()); }
  return f;
}
function ghDispatch(type, payload) {
  const t = props().getProperty('GH_TOKEN'); if (!t) return false;
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/dispatches', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' }, payload: JSON.stringify({ event_type: type, client_payload: payload }) });
  return r.getResponseCode() < 300;
}
function bugOne(id) { return rows(sheet()).find(x => String(x.id) === String(id)); }
function sheet() {
  const p = props(); let id = p.getProperty('SUG_SHEET'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('AOB 건의사항');
    p.setProperty('SUG_SHEET', ss.getId());
    const sh = ss.getSheets()[0]; sh.setName('건의'); sh.appendRow(COLS); sh.setFrozenRows(1);
  }
  return ss.getSheetByName('건의') || ss.getSheets()[0];
}
function rows(sh) {
  const v = sh.getDataRange().getValues(); v.shift();
  return v.map((r, i) => { const o = { row: i + 2 }; COLS.forEach((k, j) => { o[k] = r[j]; }); return o; }).filter(o => o.id);
}
function sugList(me, admin) {
  const sh = sheet();
  return rows(sh).map(o => {
    const likes = String(o.likes || '').split(',').filter(Boolean);
    return { id: String(o.id), at: +o.at, n: String(o.n), title: String(o.title), desc: String(o.desc), st: String(o.st || 'new'), reply: String(o.reply || ''), rat: +o.rat || 0,
      likes: likes.length, liked: !!(me && likes.indexOf(me) >= 0), mine: !!(me && o.c === me),
      kind: String(o.kind || 'idea'), shot: !!o.img, fix: String(o.fix || ''), pr: String(o.pr || ''), fsum: String(o.fsum || '') };
  }).sort((a, b) => b.at - a.at);
}

function doPost(e) { try { return doPost_(e); } catch (err) { return out({ ok: false, error: '팀 서버 오류: ' + err }); } }
function doPost_(e) {
  const b = JSON.parse(e.postData.contents || '{}');
  const lock = LockService.getScriptLock(); lock.waitLock(8000);
  try {
    // 관리자 열쇠 받기 (처음 한 번만 · 그다음부터는 아무도 못 받음)
    if (b.a === 'claim') {
      if (props().getProperty('ADMIN_KEY')) return out({ ok: false, error: '이미 관리자가 정해져 있습니다' });
      if (!allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
      const k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props().setProperty('ADMIN_KEY', k); sheet();
      return out({ ok: true, key: k });
    }
    if (b.a === 'sug_add') {
      if (!allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
      const title = String(b.title || '').trim().slice(0, 60), desc = String(b.desc || '').trim().slice(0, 1500);
      if (!title) return out({ ok: false, error: '제목을 적어 주세요' });
      const kind = ['bug', 'imp', 'idea'].indexOf(b.kind) >= 0 ? b.kind : 'idea';
      const sh = sheet(), mine = rows(sh).filter(o => o.c === b.c && Date.now() - +o.at < 3600e3).length;
      if (mine >= 10) return out({ ok: false, error: '한 시간에 10개까지 올릴 수 있습니다' });
      const id = Utilities.getUuid().slice(0, 8);
      let img = '';
      if (b.img && String(b.img).length < 3000000) { try { const f = shotFolder().createFile(Utilities.newBlob(Utilities.base64Decode(String(b.img)), 'image/jpeg', id + '.jpg')); img = f.getId(); } catch (e) { img = ''; } }
      const ft = Utilities.getUuid().replace(/-/g, '');
      const auto = kind !== 'idea' && !!props().getProperty('GH_TOKEN');
      sh.appendRow([id, Date.now(), b.c, String(b.n || '팀원').slice(0, 10), title, desc, 'new', '', '', '', kind, img, String(b.diag || '').slice(0, 6000), auto ? 'queued' : '', '', '', ft]);
      if (auto) { const ok = ghDispatch('aob-bug', { id: id, t: ft, u: ScriptApp.getService().getUrl() }); if (!ok) { const o = bugOne(id); sheet().getRange(o.row, COLS.indexOf('fix') + 1).setValue(''); } }
      return out({ ok: true, id: id, auto: auto });
    }
    if (b.a === 'sug_like') {
      if (!allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
      const sh = sheet(), o = rows(sh).find(x => String(x.id) === String(b.id)); if (!o) return out({ ok: false, error: '없는 글' });
      const likes = String(o.likes || '').split(',').filter(Boolean), i = likes.indexOf(b.c);
      if (i >= 0) likes.splice(i, 1); else likes.push(b.c);
      sh.getRange(o.row, COLS.indexOf('likes') + 1).setValue(likes.join(','));
      return out({ ok: true });
    }
    if (b.a === 'sug_rev') {
      if (!isAdmin(b.k)) return out({ ok: false, error: '관리자만 검토할 수 있습니다' });
      const sh = sheet(), o = rows(sh).find(x => String(x.id) === String(b.id)); if (!o) return out({ ok: false, error: '없는 글' });
      const st = ['new', 'review', 'yes', 'done', 'no'].indexOf(b.st) >= 0 ? b.st : o.st;
      sh.getRange(o.row, COLS.indexOf('st') + 1, 1, 3).setValues([[st, String(b.reply || '').slice(0, 1000), Date.now()]]);
      return out({ ok: true });
    }
    if (b.a === 'sug_del') {
      const sh = sheet(), o = rows(sh).find(x => String(x.id) === String(b.id)); if (!o) return out({ ok: false, error: '없는 글' });
      if (!(isAdmin(b.k) || (allowed(b.c) && o.c === b.c && (o.st || 'new') === 'new'))) return out({ ok: false, error: '지울 수 없습니다' });
      sh.deleteRow(o.row);
      return out({ ok: true });
    }
    // 관리자: GitHub 열쇠 맡기기 (오류 신고가 오면 자동 개선을 부르는 데만 씀)
    if (b.a === 'gh_set') {
      if (!isAdmin(b.k)) return out({ ok: false, error: '관리자만' });
      const g = String(b.gh || '').trim(); if (!/^(gh[pousr]_|github_pat_)[\w]+$/.test(g)) return out({ ok: false, error: '열쇠 형식이 아닙니다' });
      props().setProperty('GH_TOKEN', g); return out({ ok: true });
    }
    // 자동 개선 결과 (GitHub 워크플로가 보냄 · 신고마다 한 번 쓰는 열쇠 ft 로 확인)
    if (b.a === 'bug_done') {
      const o = bugOne(b.id); if (!o || !o.ft || String(o.ft) !== String(b.t)) return out({ ok: false, error: '열쇠가 맞지 않습니다' });
      const st = ['ready', 'nochange', 'review', 'done', 'fail', 'working'].indexOf(b.st) >= 0 ? b.st : 'fail';
      const sh = sheet(); sh.getRange(o.row, COLS.indexOf('fix') + 1, 1, 3).setValues([[st, String(b.pr || o.pr || ''), String(b.sum || o.fsum || '').slice(0, 1500)]]);
      if (st === 'done') sh.getRange(o.row, COLS.indexOf('st') + 1, 1, 3).setValues([['done', String(o.reply || '') || '자동 개선으로 반영했습니다', Date.now()]]);
      return out({ ok: true });
    }
    // 관리자: 고친 안 반영 → GitHub 에 합치기·배포 요청
    if (b.a === 'bug_ok') {
      if (!isAdmin(b.k)) return out({ ok: false, error: '관리자만' });
      const o = bugOne(b.id); if (!o || String(o.fix) !== 'ready' || !o.pr) return out({ ok: false, error: '반영할 고친 안이 없습니다' });
      if (!ghDispatch('aob-merge', { id: String(o.id), t: String(o.ft), u: ScriptApp.getService().getUrl(), pr: String(o.pr) })) return out({ ok: false, error: 'GitHub 열쇠가 없거나 만료됐습니다' });
      sheet().getRange(o.row, COLS.indexOf('fix') + 1).setValue('merging'); return out({ ok: true });
    }
    // 관리자: 다시 고쳐 보기
    if (b.a === 'bug_retry') {
      if (!isAdmin(b.k)) return out({ ok: false, error: '관리자만' });
      const o = bugOne(b.id); if (!o) return out({ ok: false, error: '없는 글' });
      const ft = Utilities.getUuid().replace(/-/g, ''), sh = sheet();
      sh.getRange(o.row, COLS.indexOf('fix') + 1, 1, 4).setValues([['queued', '', '', ft]]);
      if (!ghDispatch('aob-bug', { id: String(o.id), t: ft, u: ScriptApp.getService().getUrl(), more: String(b.more || '').slice(0, 800) })) { sh.getRange(o.row, COLS.indexOf('fix') + 1).setValue(''); return out({ ok: false, error: 'GitHub 열쇠가 없거나 만료됐습니다' }); }
      return out({ ok: true });
    }
    // ---------- OTP 요청 (아직 OTP가 없는 동료 → 관리자) ----------
    if (b.a === 'otp_req') {
      const n = String(b.n || '').trim().slice(0, 12), m = String(b.m || '').trim().toLowerCase().slice(0, 80);
      if (!n || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) return out({ ok: false, error: '이름과 구글 계정(이메일)을 정확히 넣어 주세요' });
      const sh = otpSheet(), all = otpRows(sh), day = Date.now() - 864e5;
      if (all.filter(o => +o.at > day).length >= 40) return out({ ok: false, error: '오늘 요청이 너무 많습니다. 관리자에게 직접 연락하세요' });
      const same = all.find(o => o.m === m && o.st === 'new'); if (same) return out({ ok: true, rid: String(same.rid), again: true });
      const rid = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
      sh.appendRow([rid, Date.now(), n, m, String(b.dev || '').slice(0, 20), String(b.note || '').slice(0, 200), 'new', '', '']);
      return out({ ok: true, rid: rid });
    }
    if (b.a === 'otp_done' || b.a === 'otp_no') {
      if (!isAdmin(b.k)) return out({ ok: false, error: '관리자만' });
      const sh = otpSheet(), o = otpRows(sh).find(x => String(x.rid) === String(b.rid)); if (!o) return out({ ok: false, error: '없는 요청' });
      sh.getRange(o.row, OTC.indexOf('st') + 1, 1, 3).setValues([[b.a === 'otp_done' ? 'done' : 'no', b.a === 'otp_done' ? String(b.code || '').slice(0, 30) : '', Date.now()]]);
      return out({ ok: true });
    }
    // ---------- MD's PICK (추천 상품 노트) ----------
    if (b.a === 'md_add' || b.a === 'md_edit') {
      if (!allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
      const sh = mdSheet(), o = { cat: String(b.cat || '기타').slice(0, 20), ins: String(b.ins || '').trim().slice(0, 20), prod: String(b.prod || '').trim().slice(0, 40), why: String(b.why || '').slice(0, 500), tip: String(b.tip || '').slice(0, 300) };
      if (!o.ins || !o.prod) return out({ ok: false, error: '보험사와 상품을 적어 주세요' });
      if (b.a === 'md_add') { const id = Utilities.getUuid().slice(0, 8); sh.appendRow([id, Date.now(), b.c, String(b.n || '팀원').slice(0, 10), o.cat, o.ins, o.prod, o.why, o.tip, '', '']); return out({ ok: true, id: id }); }
      const r = mdRows(sh).find(x => String(x.id) === String(b.id)); if (!r) return out({ ok: false, error: '없는 글' });
      if (!(r.c === b.c || isAdmin(b.k))) return out({ ok: false, error: '본인 글만 고칠 수 있습니다' });
      sh.getRange(r.row, MDC.indexOf('cat') + 1, 1, 5).setValues([[o.cat, o.ins, o.prod, o.why, o.tip]]); return out({ ok: true });
    }
    if (b.a === 'md_del') {
      const sh = mdSheet(), r = mdRows(sh).find(x => String(x.id) === String(b.id)); if (!r) return out({ ok: false, error: '없는 글' });
      if (!(isAdmin(b.k) || (allowed(b.c) && r.c === b.c))) return out({ ok: false, error: '지울 수 없습니다' });
      sh.deleteRow(r.row); return out({ ok: true });
    }
    if (b.a === 'md_like') {
      if (!allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
      const sh = mdSheet(), r = mdRows(sh).find(x => String(x.id) === String(b.id)); if (!r) return out({ ok: false, error: '없는 글' });
      const likes = String(r.likes || '').split(',').filter(Boolean), i = likes.indexOf(b.c); if (i >= 0) likes.splice(i, 1); else likes.push(b.c);
      sh.getRange(r.row, MDC.indexOf('likes') + 1).setValue(likes.join(',')); return out({ ok: true });
    }
    if (b.a === 'md_pin') {
      if (!isAdmin(b.k)) return out({ ok: false, error: '관리자만' });
      const sh = mdSheet(), r = mdRows(sh).find(x => String(x.id) === String(b.id)); if (!r) return out({ ok: false, error: '없는 글' });
      sh.getRange(r.row, MDC.indexOf('pin') + 1).setValue(r.pin ? '' : '1'); return out({ ok: true });
    }
    // ---------- 리그전 (주간 점수) ----------
    if (!allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.week || '')) return out({ ok: false, error: 'week' });
    const p = props(), key = 'w_' + b.week, t = JSON.parse(p.getProperty(key) || '{}');
    const n = (x, m) => Math.max(0, Math.min(+x || 0, m));
    t[b.c] = { n: String(b.n || '플래너').slice(0, 10), xp: n(b.xp, 20000), call: n(b.call, 2000), meet: n(b.meet, 500), msg: n(b.msg, 3000), lv: n(b.lv, 200), tot: n(b.tot, 10000000), st: n(b.st, 3650), ti: String(b.ti || '').slice(0, 16), at: Date.now() };
    p.setProperty(key, JSON.stringify(t));
    const all = p.getKeys().filter(k => k.indexOf('w_') === 0).sort(); while (all.length > 12) p.deleteProperty(all.shift());
    return out({ ok: true });
  } finally { lock.releaseLock(); }
}
// OTP 요청 시트
const OTC = ['rid', 'at', 'n', 'm', 'dev', 'note', 'st', 'code', 'dt'];
function otpSheet() {
  const ss = SpreadsheetApp.openById(props().getProperty('SUG_SHEET') || sheet().getParent().getId());
  let sh = ss.getSheetByName('OTP요청'); if (!sh) { sh = ss.insertSheet('OTP요청'); sh.appendRow(OTC); sh.setFrozenRows(1); }
  return sh;
}
function otpRows(sh) { const v = sh.getDataRange().getValues(); v.shift(); return v.map((r, i) => { const o = { row: i + 2 }; OTC.forEach((k, j) => { o[k] = r[j]; }); return o; }).filter(o => o.rid); }
// MD's PICK 시트
const MDC = ['id', 'at', 'c', 'n', 'cat', 'ins', 'prod', 'why', 'tip', 'likes', 'pin'];
function mdSheet() {
  const ss = SpreadsheetApp.openById(props().getProperty('SUG_SHEET') || sheet().getParent().getId());
  let sh = ss.getSheetByName('MD픽'); if (!sh) { sh = ss.insertSheet('MD픽'); sh.appendRow(MDC); sh.setFrozenRows(1); }
  return sh;
}
function mdRows(sh) { const v = sh.getDataRange().getValues(); v.shift(); return v.map((r, i) => { const o = { row: i + 2 }; MDC.forEach((k, j) => { o[k] = r[j]; }); return o; }).filter(o => o.id); }
function mdList(me) {
  return mdRows(mdSheet()).map(o => { const likes = String(o.likes || '').split(',').filter(Boolean); return { id: String(o.id), at: +o.at, by: String(o.n), cat: String(o.cat), ins: String(o.ins), prod: String(o.prod), why: String(o.why || ''), tip: String(o.tip || ''), likes: likes.length, liked: !!(me && likes.indexOf(me) >= 0), mine: !!(me && o.c === me), pin: !!o.pin }; });
}
function doGet(e) { try { return doGet_(e); } catch (err) { return out({ ok: false, error: '팀 서버 오류: ' + err }); } }
function doGet_(e) {
  const prm = e.parameter || {};
  if (prm.a === 'otpreq') { if (!isAdmin(prm.k)) return out({ ok: false, error: '관리자만' }); return out({ ok: true, rows: otpRows(otpSheet()).filter(o => o.st === 'new').map(o => ({ rid: String(o.rid), at: +o.at, n: String(o.n), m: String(o.m), dev: String(o.dev || ''), note: String(o.note || '') })) }); }
  if (prm.a === 'otpstat') { const o = otpRows(otpSheet()).find(x => String(x.rid) === String(prm.rid) && x.m === String(prm.m || '').toLowerCase()); if (!o) return out({ ok: false }); return out({ ok: true, st: String(o.st), code: o.st === 'done' ? String(o.code || '') : '' }); }
  // 자동 개선 워크플로가 신고 내용·사진을 받아 감 (신고마다 한 번 쓰는 열쇠)
  if (prm.a === 'bug_get') {
    const o = bugOne(prm.id); if (!o || !o.ft || String(o.ft) !== String(prm.t)) return out({ ok: false, error: '열쇠가 맞지 않습니다' });
    let img = ''; if (o.img) { try { img = Utilities.base64Encode(DriveApp.getFileById(String(o.img)).getBlob().getBytes()); } catch (e) { img = ''; } }
    return out({ ok: true, id: String(o.id), kind: String(o.kind), title: String(o.title), desc: String(o.desc), diag: String(o.diag || ''), reply: String(o.reply || ''), img: img });
  }
  // 관리자: 캡처 사진 보기
  if (prm.a === 'bug_img') {
    if (!isAdmin(prm.k)) return out({ ok: false, error: '관리자만' });
    const o = bugOne(prm.id); if (!o || !o.img) return out({ ok: false });
    try { return out({ ok: true, img: Utilities.base64Encode(DriveApp.getFileById(String(o.img)).getBlob().getBytes()) }); } catch (e) { return out({ ok: false }); }
  }
  if (prm.a === 'md') { const me = allowed(prm.c) ? prm.c : ''; return out({ ok: true, rows: mdList(me) }); }
  if (prm.a === 'sug') {
    const me = allowed(prm.c) ? prm.c : '';
    return out({ ok: true, admin: !props().getProperty('ADMIN_KEY') ? 'none' : 'set', bug: 2, gh: !!props().getProperty('GH_TOKEN'), rows: sugList(me) });
  }
  const week = (prm.week || ''), me = prm.c || '';
  const t = JSON.parse(props().getProperty('w_' + week) || '{}');
  const rowsL = Object.keys(t).map(k => Object.assign({ me: k === me }, t[k]));
  return out({ ok: true, week: week, rows: rowsL, sug: true });
}

// ▶ 처음 한 번: 편집기 위 함수 칸에서 '권한설정' 을 고르고 ▶ 실행 → 권한 검토 → 허용 (시트·드라이브·인터넷 접속을 한 번에 허락)
function 권한설정() {
  UrlFetchApp.fetch(ACCESS + '?t=' + Date.now(), { muteHttpExceptions: true });
  CacheService.getScriptCache().put('ping', '1', 60);
  sheet(); otpSheet(); mdSheet(); shotFolder();
  Logger.log('완료: 팀 서버 권한이 모두 허락됐습니다. 이제 배포 → 배포 관리 → 연필 → 새 버전 → 배포 를 해 주세요.');
}
