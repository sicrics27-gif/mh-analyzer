// 진료이력(병원별) + 미청구 보험금(실손 1~5세대) 계산 (브라우저/Node 공용)
(function (root) {
  var A = root.Analyzer || (typeof require !== 'undefined' ? require('./analyzer.js') : null);

  function isPharm(h, dept) { return A.isPharm(h, dept); }
  function addY(base, y) { return A.fmt(A.addM(A.pd(base), -12 * y)); }

  // 방문 단위 모델: 병원 방문(병원+날짜), 약국 조제(약국+날짜)
  function buildVisits(input, base, years) {
    var from = addY(base, years || 5);
    var inWin = function (d) { return d && d > from && d <= base; };
    var basic = input.basic || [], recent = (input.recent && input.recent.rows) || [], rx = input.rx || [], detail = input.detail || [];
    var visits = {}, pharms = {};
    function vkey(h, d) { return h + '|' + d; }
    function addVisit(r, src) {
      var k = vkey(r.hosp, r.date);
      var v = visits[k];
      if (!v) v = visits[k] = { key: k, hosp: r.hosp, hospDisp: r.hospDisp || r.hosp, date: r.date, codes: [], depts: {}, inp: false, inDays: 0, pay: 0, src: src, rx: false, surg: [], exam: [], pharm: [] };
      if (r.code && !v.codes.some(function (c) { return c.code === r.code; })) v.codes.push({ code: r.code, name: r.name });
      if (r.dept) v.depts[r.dept] = 1;
      if (/입원/.test(r.type || '')) { v.inp = true; v.inDays = Math.max(v.inDays, r.days || r.inDays || 1); }
      v.pay += r.pay || 0;
      return v;
    }
    function addPharm(r, src) {
      var k = vkey(r.hosp, r.date);
      var p = pharms[k];
      if (!p) p = pharms[k] = { key: k, hosp: r.hosp, hospDisp: r.hospDisp || r.hosp, date: r.date, codes: [], pay: 0, src: src, link: null };
      if (r.code && !p.codes.some(function (c) { return c.code === r.code; })) p.codes.push({ code: r.code, name: r.name });
      p.pay += r.pay || 0;
      return p;
    }
    var basicKeys = {};
    basic.forEach(function (r) {
      if (!inWin(r.date)) return;
      basicKeys[vkey(r.hosp, r.date)] = 1;
      if (isPharm(r.hosp, r.dept)) addPharm(r, 'basic'); else addVisit(r, 'basic');
    });
    recent.forEach(function (r) {
      if (!inWin(r.date) || basicKeys[vkey(r.hosp, r.date)]) return;
      var rr = { hosp: r.hosp, hospDisp: r.hospDisp, date: r.date, code: r.code, name: r.name, type: r.type, days: r.inDays, pay: r.pay || 0 };
      if (/약국/.test(r.type) || isPharm(r.hosp, '')) addPharm(rr, 'recent'); else addVisit(rr, 'recent');
    });
    // 처방(병원 처방·투약이력)에만 있는 병원 방문: 진단명 파악 불가
    rx.forEach(function (x) {
      if (!inWin(x.date) || !x.hosp || isPharm(x.hosp, '')) return;
      var k = vkey(x.hosp, x.date);
      if (!visits[k]) { visits[k] = { key: k, hosp: x.hosp, hospDisp: x.hosp, date: x.date, codes: [], depts: {}, inp: false, inDays: 0, pay: 0, src: 'rx', rx: true, surg: [], exam: [], pharm: [] }; }
      visits[k].rx = true;
    });
    // 세부진료: 수술·검사
    detail.forEach(function (d) {
      var v = visits[vkey(d.hosp, d.date)]; if (!v) return;
      var c = A.classifyDetail(d);
      if (c.surg && v.surg.indexOf(d.item) < 0) v.surg.push(d.item);
      if (c.exam && v.exam.indexOf(d.item) < 0) v.exam.push(d.item);
    });
    // 약국 → 같은 날 병원 방문에 연결
    var byDate = {};
    Object.keys(visits).forEach(function (k) { var v = visits[k]; (byDate[v.date] = byDate[v.date] || []).push(v); });
    var ingr = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12); };
    Object.keys(pharms).forEach(function (k) {
      var p = pharms[k], cands = byDate[p.date] || [];
      if (!cands.length) return;
      var best = null, bestS = -1;
      var pIng = rx.filter(function (x) { return x.date === p.date && x.hosp === p.hosp; }).map(function (x) { return ingr(x.ingr); }).filter(Boolean);
      cands.forEach(function (v) {
        var s = 0;
        if (p.codes.some(function (c) { return v.codes.some(function (d) { return d.code === c.code; }); })) s += 5;
        var vIng = rx.filter(function (x) { return x.date === v.date && x.hosp === v.hosp; }).map(function (x) { return ingr(x.ingr); });
        if (pIng.some(function (a) { return vIng.indexOf(a) >= 0; })) s += 10;
        if (v.rx) s += 1;
        if (s > bestS) { bestS = s; best = v; }
      });
      p.link = best.key; best.pharm.push(p); best.rx = true;
    });
    return { visits: visits, pharms: pharms, from: from };
  }

  // 진료이력: 병원별 묶음
  function history(input, base) {
    var M = buildVisits(input, base, 5);
    var groups = {};
    function g(h, disp) { return groups[h] = groups[h] || { hosp: h, name: disp, pharmNames: {}, visits: [], last: '' }; }
    Object.keys(M.visits).forEach(function (k) {
      var v = M.visits[k], G = g(v.hosp, v.hospDisp);
      G.visits.push(v); if (v.date > G.last) G.last = v.date;
      v.pharm.forEach(function (p) { G.pharmNames[p.hospDisp] = 1; });
    });
    Object.keys(M.pharms).forEach(function (k) {
      var p = M.pharms[k]; if (p.link) return;
      var G = g(p.hosp, p.hospDisp);
      var v = { key: k, hosp: p.hosp, hospDisp: p.hospDisp, date: p.date, codes: p.codes, depts: {}, inp: false, inDays: 0, pay: 0, src: p.src, rx: true, surg: [], exam: [], pharm: [p], pharmOnly: true };
      G.visits.push(v); if (v.date > G.last) G.last = v.date;
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.last < b.last ? 1 : -1; });
    list.forEach(function (G) {
      G.visits.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      G.pharmList = Object.keys(G.pharmNames);
      // 진단별 요약
      var by = {};
      G.visits.forEach(function (v) {
        var codes = v.codes.length ? v.codes.slice(0, 1) : [{ code: '', name: '' }];
        codes.forEach(function (c) {
          var r = by[c.code] = by[c.code] || { code: c.code, name: c.name, depts: {}, dates: {}, first: v.date, last: v.date, dx: !!c.code, rx: false, inp: false, surg: false, exam: false, inDays: 0 };
          Object.keys(v.depts).forEach(function (d) { r.depts[d] = 1; });
          r.dates[v.date] = 1;
          if (v.date < r.first) r.first = v.date; if (v.date > r.last) r.last = v.date;
          if (v.rx || v.pharm.length) r.rx = true;
          if (v.inp) { r.inp = true; r.inDays += v.inDays; }
          if (v.surg.length) r.surg = true;
          if (v.exam.length) r.exam = true;
        });
      });
      G.byCode = Object.keys(by).map(function (k) { var r = by[k]; r.days = Object.keys(r.dates).length + (r.inDays ? Math.max(0, r.inDays - 1) : 0); r.deptList = Object.keys(r.depts).filter(Boolean); return r; })
        .sort(function (a, b) { return a.last < b.last ? 1 : -1; });
    });
    return { groups: list, from: M.from };
  }

  // ---------- 실손 세대별 계산 ----------
  // 요양기관 종별 추정 (이름 기준)
  function level(name) {
    var n = String(name || '');
    if (/대학교병원|대학병원|대학교의과대학|서울아산|삼성서울|세브란스|서울성모|상급종합/.test(n)) return 'top';
    if (/종합병원|의료원/.test(n)) return 'gen';
    if (/의원$|의원\s|치과의원|한의원|보건소|보건지소|보건진료소/.test(n) || /의원/.test(n) && !/병원/.test(n)) return 'clinic';
    if (/병원/.test(n)) return 'hosp';
    return 'clinic';
  }
  var DED = { clinic: 10000, hosp: 15000, gen: 20000, top: 20000 };
  var DED4 = { clinic: 10000, hosp: 10000, gen: 20000, top: 20000 };
  var RATE5 = { clinic: 0.3, hosp: 0.4, gen: 0.5, top: 0.6 };
  function floor10(x) { return Math.max(0, Math.round(x)); }
  function gens(h, p, lv, inp) {
    h = h || 0; p = p || 0;
    if (inp) {
      var t = h + p;
      return [t, t * 0.9, t * 0.9, t * 0.8, t * 0.8].map(floor10);
    }
    var g1 = Math.max(0, h - 5000) + Math.max(0, p - 5000);
    var g2 = Math.max(0, h - Math.max(DED[lv], h * 0.2)) + Math.max(0, p - Math.max(8000, p * 0.2));
    var g3 = Math.max(0, h - Math.max(DED[lv], h * 0.1)) + Math.max(0, p - Math.max(8000, p * 0.1));
    var t = h + p;
    var g4 = Math.max(0, t - Math.max(DED4[lv], t * 0.2));
    var g5 = Math.max(0, t - Math.max(DED4[lv], t * RATE5[lv]));
    return [g1, g2, g3, g4, g5].map(floor10);
  }
  function claims(input, base) {
    var M = buildVisits(input, base, 3);
    var rows = [];
    Object.keys(M.visits).forEach(function (k) {
      var v = M.visits[k];
      var pp = v.pharm.reduce(function (s, p) { return s + p.pay; }, 0);
      if (!v.pay && !pp) return;
      var lv = level(v.hospDisp);
      rows.push({ key: v.key, date: v.date, hosp: v.hospDisp, inp: v.inp, inDays: v.inDays, codes: v.codes, h: v.pay, p: v.pharm.length ? pp : null, lv: lv, g: gens(v.pay, pp, lv, v.inp), surg: v.surg.length > 0, surgItems: v.surg });
    });
    Object.keys(M.pharms).forEach(function (k) {
      var p = M.pharms[k]; if (p.link || !p.pay) return;
      rows.push({ key: p.key, date: p.date, hosp: p.hospDisp, inp: false, inDays: 0, codes: p.codes, h: null, p: p.pay, lv: 'clinic', g: gens(0, p.pay, 'clinic', false), pharmOnly: true });
    });
    rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var tot = { h: 0, p: 0, g: [0, 0, 0, 0, 0] };
    rows.forEach(function (r) { tot.h += r.h || 0; tot.p += r.p || 0; r.g.forEach(function (x, i) { tot.g[i] += x; }); });
    return { rows: rows, tot: tot, from: M.from, base: base, hasCost: (input.basic || []).some(function (r) { return r.pay > 0; }) || ((input.recent && input.recent.rows) || []).some(function (r) { return r.pay > 0; }) };
  }

  var api = { history: history, claims: claims, level: level, gens: gens, visits: buildVisits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Claims = api;
})(this);
