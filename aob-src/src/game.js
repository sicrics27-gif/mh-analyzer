// 영업 RPG: 고객을 챙기는 행동을 경험치·레벨·퀘스트·배지로 (브라우저/Node 공용)
// 점수는 따로 기록하지 않고 이미 저장된 상담 기록·분석·단계에서 계산 → 기기 간 동기화도 그대로.
(function (root) {
  // 같은 고객·같은 날·같은 종류는 한 번만 (기록을 여러 번 눌러 점수 부풀리기 방지)
  var XP = { call: 10, miss: 3, sms: 8, kakao: 8, meet: 30, note: 2, add: 5, analyze: 20, coverage: 15, nhc: 20, claim: 40, consult: 15, contract: 80, care: 20, proc: 10, refund: 40 };
  var XP_TXT = { call: '통화', miss: '부재중 통화', sms: '문자', kakao: '카톡', meet: '만남', note: '메모', add: '고객 등록', analyze: '병력 분석', coverage: '보장분석 반영', nhc: '보장분석부서 의뢰', claim: '청구 안내', consult: '상담 시작', contract: '계약', care: '관리 고객 전환', proc: '계약 프로세스 처리', refund: '환급금 찾아드림', quest: '퀘스트 완료' };
  var TITLES = [[1, '신입 플래너'], [3, '루키 플래너'], [5, '오션 레인저'], [8, '케어 스페셜리스트'], [12, '보장 마스터'], [16, '오션 레전드'], [20, 'AOB9 그랜드마스터']];
  function need(lv) { return 100 + (lv - 1) * 60; }           // 레벨 lv → lv+1 에 필요한 XP
  function levelOf(xp) { var lv = 1, rest = xp; while (rest >= need(lv)) { rest -= need(lv); lv++; } return { lv: lv, cur: rest, need: need(lv) }; }
  function titleOf(lv) { var t = TITLES[0][1]; TITLES.forEach(function (x) { if (lv >= x[0]) t = x[1]; }); return t; }
  function ymdOf(ms) { var d = new Date(ms - new Date().getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 10); }
  function addDay(a, n) { var t = new Date(a + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }

  // 모든 고객에서 경험치 사건 뽑기
  function events(list) {
    var ev = [], seen = {};
    function push(cid, d, k, extra) { if (!d || !XP[k]) return; var key = cid + '|' + d + '|' + k; if (seen[key]) return; seen[key] = 1; ev.push(Object.assign({ cid: cid, d: d, k: k, xp: XP[k] }, extra || {})); }
    list.forEach(function (c) {
      if (c.sample) return;
      if (c.created) push(c.id, ymdOf(c.created), 'add');
      (c.notes || []).forEach(function (n) {
        var k = n.k === 'call' ? (n.ok === false ? 'miss' : 'call') : n.k === 'msg' ? 'sms' : n.k;
        if (/^\[NHC/.test(n.t || '')) return;
        push(c.id, n.d, k);
      });
      var g = c.game || {};
      ['analyze', 'coverage', 'nhc', 'claim', 'consult', 'contract', 'care', 'proc', 'refund'].forEach(function (k) { (g[k] || []).forEach(function (d) { push(c.id, d, k); }); });
    });
    return ev;
  }
  function contactDay(e) { return /^(call|sms|kakao|meet)$/.test(e.k); }

  // 오늘의 퀘스트 (날짜마다 바뀜, 브리핑 데이터와 연결)
  function quests(today, B, ev) {
    var todayEv = ev.filter(function (e) { return e.d === today; });
    var did = function (k, ids) { return todayEv.filter(function (e) { return (Array.isArray(k) ? k.indexOf(e.k) >= 0 : e.k === k) && (!ids || ids[e.cid]); }).length; };
    var ids = function (arr) { var o = {}; (arr || []).forEach(function (x) { o[x.c.id] = 1; }); return o; };
    var pool = [];
    if (B && B.bday.length) pool.push({ id: 'bday', t: '생일 고객 축하 연락', goal: Math.min(2, B.bday.length), done: did(['call', 'sms', 'kakao', 'meet'], ids(B.bday)), xp: 40, hint: '브리핑 → 생일 (7일 안)' });
    if (B && B.quiet.length) pool.push({ id: 'quiet', t: '오래 연락 못 한 고객 깨우기', goal: Math.min(3, B.quiet.length), done: did(['call', 'sms', 'kakao', 'meet'], ids(B.quiet)), xp: 50, hint: '브리핑 → 오래 연락 못 한 고객' });
    if (B && B.claim.length) pool.push({ id: 'claim', t: '청구기한 임박 고객 안내', goal: 1, done: did(['claim', 'call', 'kakao', 'sms'], ids(B.claim)), xp: 50, hint: '브리핑 → 청구기한 임박' });
    if (B && B.todo.length) pool.push({ id: 'todo', t: '오늘 할 일 처리', goal: Math.min(3, B.todo.length), done: Math.min(did(['call', 'sms', 'kakao', 'meet', 'note'], ids(B.todo)), 3), xp: 30, hint: '브리핑 → 오늘 할 일' });
    if (B && B.ann.length) pool.push({ id: 'ann', t: '응당일 고객 안부', goal: 1, done: did(['call', 'sms', 'kakao', 'meet'], ids(B.ann)), xp: 30, hint: '브리핑 → 계약 응당일' });
    var base = [
      { id: 'call5', t: '통화 5건', goal: 5, done: did('call'), xp: 30, hint: '부재중은 빼고 셉니다' },
      { id: 'msg3', t: '카톡·문자 안부 3건', goal: 3, done: did(['sms', 'kakao']), xp: 20, hint: '고객 화면 → 카톡 보내기' },
      { id: 'meet1', t: '고객 만나기 1건', goal: 1, done: did('meet'), xp: 40, hint: '상담 기록 → 만남' },
      { id: 'nhc1', t: '보장분석 의뢰 1건', goal: 1, done: did('nhc'), xp: 30, hint: '보장 현황 → 분석 의뢰' }
    ];
    // 날짜로 섞어 3개 고르기 (브리핑 연동 퀘스트 우선)
    var seed = +today.replace(/-/g, '') % 97;
    var pick = pool.slice(0, 2);
    var rest = base.slice(seed % base.length).concat(base.slice(0, seed % base.length));
    while (pick.length < 3 && rest.length) pick.push(rest.shift());
    return pick.map(function (q) { q.done = Math.min(q.done, q.goal); q.ok = q.done >= q.goal; return q; });
  }

  var BADGES = [
    ['call1', '첫 통화', '통화 기록 1건', function (s) { return s.n.call >= 1; }],
    ['call100', '콜 마스터', '통화 100건', function (s) { return s.n.call >= 100; }],
    ['meet10', '발로 뛰는 플래너', '만남 10건', function (s) { return s.n.meet >= 10; }],
    ['meet50', '현장의 달인', '만남 50건', function (s) { return s.n.meet >= 50; }],
    ['msg100', '안부 장인', '카톡·문자 100건', function (s) { return s.n.sms + s.n.kakao >= 100; }],
    ['streak7', '7일 연속', '7일 연속 고객 연락', function (s) { return s.best >= 7; }],
    ['streak30', '30일 연속', '30일 연속 고객 연락', function (s) { return s.best >= 30; }],
    ['contract1', '첫 계약', '계약 단계 고객 1명', function (s) { return s.n.contract >= 1; }],
    ['contract10', '열 번째 계약', '계약 10건', function (s) { return s.n.contract >= 10; }],
    ['claim10', '숨은 보험금 헌터', '청구 안내 10건', function (s) { return s.n.claim >= 10; }],
    ['nhc10', '본사와 한 팀', '보장분석부서 의뢰 10건', function (s) { return s.n.nhc >= 10; }],
    ['cust100', '고객 100명', '등록 고객 100명', function (s) { return s.n.add >= 100; }],
    ['quest30', '퀘스트 헌터', '오늘의 퀘스트 30개 완료', function (s) { return s.questDone >= 30; }]
  ];

  // qlog: {날짜: [완료한 퀘스트 id...]} — 완료 보너스는 기록해 둔 것만 인정
  function compute(list, today, B, qlog) {
    var ev = events(list), n = {};
    Object.keys(XP).forEach(function (k) { n[k] = 0; });
    ev.forEach(function (e) { n[e.k]++; });
    var qx = 0, questDone = 0; Object.keys(qlog || {}).forEach(function (d) { (qlog[d] || []).forEach(function (q) { qx += q.xp || 0; questDone++; }); });
    var xp = ev.reduce(function (s, e) { return s + e.xp; }, 0) + qx;
    var L = levelOf(xp);
    // 연속 기록
    var days = {}; ev.forEach(function (e) { if (contactDay(e)) days[e.d] = 1; });
    var streak = 0, d = today; if (!days[d]) d = addDay(d, -1);
    while (days[d]) { streak++; d = addDay(d, -1); }
    var best = 0, run = 0, all = Object.keys(days).sort(); all.forEach(function (x, i) { run = i && dayDiff(all[i - 1], x) === 1 ? run + 1 : 1; if (run > best) best = run; });
    // 최근 7일·이번 주
    var week = []; for (var i = 6; i >= 0; i--) { var dd = addDay(today, -i); week.push({ d: dd, xp: ev.filter(function (e) { return e.d === dd; }).reduce(function (s, e) { return s + e.xp; }, 0) + ((qlog || {})[dd] || []).reduce(function (s, q) { return s + (q.xp || 0); }, 0) }); }
    var wd = new Date(today + 'T12:00:00').getDay(), mon = addDay(today, -((wd + 6) % 7));
    var wk = { xp: 0, call: 0, meet: 0, msg: 0, contract: 0 };
    ev.forEach(function (e) { if (e.d >= mon && e.d <= today) { wk.xp += e.xp; if (e.k === 'call') wk.call++; if (e.k === 'meet') wk.meet++; if (e.k === 'sms' || e.k === 'kakao') wk.msg++; if (e.k === 'contract') wk.contract++; } });
    Object.keys(qlog || {}).forEach(function (dq) { if (dq >= mon && dq <= today) (qlog[dq] || []).forEach(function (q) { wk.xp += q.xp || 0; }); });
    var stat = { n: n, best: Math.max(best, streak), questDone: questDone };
    var badges = BADGES.map(function (b) { return { id: b[0], t: b[1], d: b[2], ok: b[3](stat) }; });
    var todayXp = week[6].xp;
    var recent = ev.filter(function (e) { return e.d >= addDay(today, -6); }).sort(function (a, b) { return a.d < b.d ? 1 : -1; }).slice(0, 12);
    return { xp: xp, lv: L.lv, cur: L.cur, need: L.need, title: titleOf(L.lv), nextTitle: (TITLES.find(function (x) { return x[0] > L.lv; }) || [0, ''])[1], nextTitleLv: (TITLES.find(function (x) { return x[0] > L.lv; }) || [0])[0], streak: streak, best: stat.best, week: week, wk: wk, monday: mon, today: todayXp, n: n, badges: badges, quests: quests(today, B, ev), recent: recent };
  }

  var api = { compute: compute, events: events, levelOf: levelOf, titleOf: titleOf, XP: XP, XP_TXT: XP_TXT, TITLES: TITLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Game = api;
})(this);
