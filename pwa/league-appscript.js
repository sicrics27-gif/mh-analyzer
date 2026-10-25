// AFG OC9 · 9팀 리그전 서버 (구글 Apps Script) — 관리자(강남혁) 구글 계정에서 한 번 배포
// 저장하는 것: 별명, 주간 경험치·통화·만남·연락 수, 레벨. 고객 정보는 받지 않습니다.
// OTP가 '사용 중'인 사람만 점수를 올릴 수 있습니다 (access.json 확인).
const ACCESS = 'https://raw.githubusercontent.com/sicrics27-gif/mh-analyzer/main/access.json';
function allowed(c) {
  const cache = CacheService.getScriptCache();
  let j = cache.get('acc');
  if (!j) { j = UrlFetchApp.fetch(ACCESS + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText(); cache.put('acc', j, 300); }
  try { const a = JSON.parse(j); const u = (a.users || {})[c]; return !!(u && u.s === 1); } catch (e) { return false; }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  const b = JSON.parse(e.postData.contents || '{}');
  if (!b.c || !/^[0-9a-f]{24}$/.test(b.c) || !allowed(b.c)) return out({ ok: false, error: 'OTP 사용자가 아닙니다' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.week || '')) return out({ ok: false, error: 'week' });
  const lock = LockService.getScriptLock(); lock.waitLock(5000);
  try {
    const p = PropertiesService.getScriptProperties(), key = 'w_' + b.week, t = JSON.parse(p.getProperty(key) || '{}');
    const n = (x, m) => Math.max(0, Math.min(+x || 0, m));
    t[b.c] = { n: String(b.n || '플래너').slice(0, 10), xp: n(b.xp, 20000), call: n(b.call, 2000), meet: n(b.meet, 500), msg: n(b.msg, 3000), lv: n(b.lv, 200), tot: n(b.tot, 10000000), st: n(b.st, 3650), ti: String(b.ti || '').slice(0, 16), at: Date.now() };
    p.setProperty(key, JSON.stringify(t));
    const all = p.getKeys().filter(k => k.indexOf('w_') === 0).sort(); while (all.length > 12) p.deleteProperty(all.shift());
  } finally { lock.releaseLock(); }
  return out({ ok: true });
}
function doGet(e) {
  const week = (e.parameter.week || ''), me = e.parameter.c || '';
  const t = JSON.parse(PropertiesService.getScriptProperties().getProperty('w_' + week) || '{}');
  const rows = Object.keys(t).map(k => Object.assign({ me: k === me }, t[k]));
  return out({ ok: true, week: week, rows: rows });
}
