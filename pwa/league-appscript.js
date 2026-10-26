// AOB9 · 9팀 팀 서버 (리그전 + 건의사항 + MD's PICK + OTP 요청) — 구글 Apps Script, 관리자(강남혁) 구글 계정에서 한 번 배포
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
const COLS = ['id', 'at', 'c', 'n', 'title', 'desc', 'st', 'reply', 'rat', 'likes'];
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
      likes: likes.length, liked: !!(me && likes.indexOf(me) >= 0), mine: !!(me && o.c === me) };
  }).sort((a, b) => b.at - a.at);
}

function doPost(e) {
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
      const title = String(b.title || '').trim().slice(0, 60), desc = String(b.desc || '').trim().slice(0, 1000);
      if (!title) return out({ ok: false, error: '제목을 적어 주세요' });
      const sh = sheet(), mine = rows(sh).filter(o => o.c === b.c && Date.now() - +o.at < 3600e3).length;
      if (mine >= 10) return out({ ok: false, error: '한 시간에 10개까지 올릴 수 있습니다' });
      const id = Utilities.getUuid().slice(0, 8);
      sh.appendRow([id, Date.now(), b.c, String(b.n || '팀원').slice(0, 10), title, desc, 'new', '', '', '']);
      return out({ ok: true, id: id });
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
function doGet(e) {
  const prm = e.parameter || {};
  if (prm.a === 'otpreq') { if (!isAdmin(prm.k)) return out({ ok: false, error: '관리자만' }); return out({ ok: true, rows: otpRows(otpSheet()).filter(o => o.st === 'new').map(o => ({ rid: String(o.rid), at: +o.at, n: String(o.n), m: String(o.m), dev: String(o.dev || ''), note: String(o.note || '') })) }); }
  if (prm.a === 'otpstat') { const o = otpRows(otpSheet()).find(x => String(x.rid) === String(prm.rid) && x.m === String(prm.m || '').toLowerCase()); if (!o) return out({ ok: false }); return out({ ok: true, st: String(o.st), code: o.st === 'done' ? String(o.code || '') : '' }); }
  if (prm.a === 'md') { const me = allowed(prm.c) ? prm.c : ''; return out({ ok: true, rows: mdList(me) }); }
  if (prm.a === 'sug') {
    const me = allowed(prm.c) ? prm.c : '';
    return out({ ok: true, admin: !props().getProperty('ADMIN_KEY') ? 'none' : 'set', rows: sugList(me) });
  }
  const week = (prm.week || ''), me = prm.c || '';
  const t = JSON.parse(props().getProperty('w_' + week) || '{}');
  const rowsL = Object.keys(t).map(k => Object.assign({ me: k === me }, t[k]));
  return out({ ok: true, week: week, rows: rowsL, sug: true });
}
