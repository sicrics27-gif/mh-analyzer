// 보유 특약 × 진료기록 대조 → 청구해 볼 만한 건 (브라우저/Node 공용)
(function (root) {
  var Cv = root.Coverage || (typeof require !== 'undefined' ? require('./coverage.js') : null);

  function addYears(d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCFullYear(t.getUTCFullYear() + n); return t.toISOString().slice(0, 10); }
  function days(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }
  function inRange(c, d) { return (!c.start || d >= c.start) && (!c.end || d <= c.end); }
  function cd(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function anyCode(v, re) { return v.codes.some(function (c) { return re.test(cd(c.code)); }); }
  function firstCode(v, re) { return v.codes.find(function (c) { return re.test(cd(c.code)); }); }
  var INJ = /^[ST]/, FRAC = /^S(0[2-9]|[1-9])2/, BURN = /^T(2\d|3[0-2])/;
  var CANCER = /^C(?!44|73)\d/, MINI = /^(C44|C73|D0\d|D3[7-9]|D4[0-8])/;
  var HEMO = /^I6[0-2]/, STROKE = /^I6[0-3]/, CEREBRO = /^I6\d/, AMI = /^I2[1-3]/, ISCH = /^I2[0-5]/;
  var DIS = function (v) { return v.codes.length && !anyCode(v, INJ); };
  var INJV = function (v) { return anyCode(v, INJ); };

  // 특약 분류 규칙: rider 이름 패턴 → 진료 조건
  var RULES = [
    { id: 'dxCancer', label: '암 진단비', grp: '진단', r: /암.*진단|통합암|일반암/, x: /유사암|소액암|갑상선|기타피부|제자리|경계성|재진단|전이암/, ev: function (v) { return firstCode(v, CANCER); }, once: true, note: '최초 1회 지급 · 이미 받았는지 확인' },
    { id: 'dxMini', label: '유사암 진단비', grp: '진단', r: /유사암|소액암|갑상선암.*진단|기타피부암|제자리암|경계성종양/, x: /치료|약물|호르몬/, ev: function (v) { return firstCode(v, MINI); }, once: true, note: '최초 1회 · 갑상선·제자리암 등' },
    { id: 'dxHemo', label: '뇌출혈 진단비', grp: '진단', r: /뇌출혈/, ev: function (v) { return firstCode(v, HEMO); }, once: true, note: '최초 1회' },
    { id: 'dxStroke', label: '뇌졸중·뇌혈관 진단비', grp: '진단', r: /뇌졸중|뇌경색|뇌혈관/, x: /혈전|치료비/, ev: function (v) { return firstCode(v, /뇌혈관/.test(this._n) ? CEREBRO : STROKE); }, once: true, note: '최초 1회 · 영상검사 확진 필요' },
    { id: 'dxAmi', label: '급성심근경색 진단비', grp: '진단', r: /급성심근경색|특정Ⅱ/, x: /혈전|치료비/, ev: function (v) { return firstCode(v, AMI); }, once: true, note: '최초 1회' },
    { id: 'dxIsch', label: '허혈성심장질환 진단비', grp: '진단', r: /허혈성|심장질환|특정Ⅰ/, x: /혈전|치료비|급성심근/, ev: function (v) { return firstCode(v, ISCH); }, once: true, note: '최초 1회' },
    { id: 'dxFrac', label: '골절 진단비', grp: '상해', r: /골절.*진단|골절진단|5대골절진단|재해골절|의료비보장/, x: /수술/, ev: function (v) { return firstCode(v, FRAC); }, note: '치아 파절 제외 · 5대골절은 부위 한정' },
    { id: 'surgFrac', label: '골절 수술비', grp: '상해', r: /골절.*수술/, ev: function (v) { return v.surg.length && firstCode(v, FRAC); }, note: '골절 부위 수술 확인' },
    { id: 'dxBurn', label: '화상 진단비', grp: '상해', r: /화상.*진단/, x: /중대한/, ev: function (v) { return firstCode(v, BURN); }, note: '심재성 2도 이상' },
    { id: 'cast', label: '깁스 치료비', grp: '상해', r: /깁스/, ev: function (v) { return firstCode(v, FRAC); }, note: '깁스(석고붕대) 했는지 확인 · 부목 제외 상품 있음' },
    { id: 'surgInj', label: '상해 수술비', grp: '수술', r: /상해.*수술|수술급여금\s*상해/, x: /흉터|성형|중대한|외모|골절|인공관절|각막/, ev: function (v) { return v.surg.length && INJV(v) && v.codes.find(function (c) { return INJ.test(cd(c.code)); }); }, note: '수술 정의(절단·적출 등) 약관 확인' },
    { id: 'surgDis', label: '질병 수술비', grp: '수술', r: /질병.*수술|수술급여금\s*질병|종수술|대질병수술|수술특약|기타수술/, x: /암|특정질병|7대|인공관절|각막/, ev: function (v) { return v.surg.length && DIS(v) && v.codes[0]; }, note: '수술 분류(1~5종·N대질병) 약관 확인' },
    { id: 'inpDis', label: '질병 입원일당', grp: '입원', r: /질병.*입원일당|입원특약\s*질병|특정질병입원|종신입원특약\s*질병/, x: /간병|중환자|요양병원|상급|종합병원/, ev: function (v) { return v.inp && DIS(v) && v.codes[0]; }, perDay: true, note: '입원 일수 × 일당 · 면책일수 약관 확인' },
    { id: 'inpInj', label: '상해 입원일당', grp: '입원', r: /상해.*입원일당|입원특약\s*상해/, x: /간병|중환자|교통/, ev: function (v) { return v.inp && INJV(v) && v.codes.find(function (c) { return INJ.test(cd(c.code)); }); }, perDay: true, note: '입원 일수 × 일당' },
    { id: 'inpCare', label: '간병인 지원 입원일당', grp: '입원', r: /간병인.*입원일당/, ev: function (v) { return v.inp && v.codes[0]; }, perDay: true, note: '간병인 사용 시에만 · 질병/상해 구분 확인' }
  ];
  var COND = /5대|특정|\d+대|중대한|기타수술|간병|재해|강력|보복|최초1회|연간1회/;
  function ruleOf(name) {
    for (var i = 0; i < RULES.length; i++) { var R = RULES[i]; if (R.r.test(name) && !(R.x && R.x.test(name))) return R; }
    return null;
  }

  // 1~N종 수술처럼 종별로 나뉜 특약은 수술 1건에 한 종만 지급 → 평균 한 줄로 (규칙 5-1)
  function tierRiders(c) {
    if (c._tier) return c._tier;
    var out = [], grp = {};
    c.riders.forEach(function (r) {
      var m = r.name.match(/\((\d+)종\)/);
      if (r.type === '정액' && m && /수술/.test(r.name)) {
        var k = r.name.replace(/\(\d+종\)/, '').replace(/\s+/g, ' ');
        if (!grp[k]) { grp[k] = { type: '정액', name: k + ' (종별 평균)', list: [] }; out.push(grp[k]); }
        grp[k].list.push(r.amount);
      } else out.push(r);
    });
    out.forEach(function (g) { if (g.list) { g.amount = Math.round(g.list.reduce(function (a, b) { return a + b; }, 0) / g.list.length); g.amtText = (g.amount / 1e4) + '만'; g.tier = g.list.length; } });
    Object.defineProperty(c, '_tier', { value: out, enumerable: false });
    return out;
  }
  // 실손 계약 → 세대
  function silsonPlan(cov) {
    if (!cov) return [];
    return cov.contracts.filter(function (c) { return c.silson; }).map(function (c) {
      var out = c.riders.filter(function (r) { return r.type === '실손' && /외래|통원/.test(r.name) && !/입원/.test(r.name) && r.amount && r.amount <= 1e6; });
      return { company: c.company, product: c.product, start: c.start, end: c.end, gen: Cv.silsonGen(c.start), outLimit: out.length ? Math.max.apply(null, out.map(function (r) { return r.amount; })) : 0 };
    }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }
  function genOn(plan, d) {
    var act = plan.filter(function (p) { return inRange(p, d); });
    return act.length ? act : [];
  }

  // CL: Claims.claims() 결과 · visits: Claims.visits(input, base, 3).visits
  function match(cov, CL, visitsMap, base) {
    var plan = silsonPlan(cov), today = base;
    // 실손: 진료마다 해당일 가입 실손의 세대로
    var silson = CL.rows.map(function (r) {
      var act = genOn(plan, r.date);
      var g = act.length ? act[0].gen : 0, amt = g ? r.g[g - 1] : 0;
      if (g && !r.inp && act[0].outLimit) amt = Math.min(amt, act[0].outLimit);
      var dl = addYears(r.date, 3);
      return { key: 'S|' + r.key, kind: 'silson', date: r.date, hosp: r.hosp, inp: r.inp, surg: r.surg, h: r.h, p: r.p, gen: g, plan: act[0] || null, dup: act.length > 1, amt: Math.round(amt), deadline: dl, left: days(today, dl) };
    });
    // 정액 특약
    var flat = [];
    if (cov) {
      var vs = Object.keys(visitsMap).map(function (k) { return visitsMap[k]; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var onceSeen = {};
      vs.slice().reverse().forEach(function (v) { // 오래된 순으로 진단비 첫 진단만
        var hits = {};
        cov.contracts.forEach(function (c, ci) {
          if (!inRange(c, v.date)) return;
          tierRiders(c).forEach(function (rd) {
            if (rd.type !== '정액' || !rd.amount) return;
            var R = ruleOf(rd.name); if (!R) return;
            R._n = rd.name; var code = R.ev(v); if (!code) return;
            if (R.once) { var ok = R.id + '|' + ci + '|' + rd.name; if (onceSeen[ok] && onceSeen[ok] !== v.key) return; onceSeen[ok] = v.key; }
            var h = hits[R.id] = hits[R.id] || { R: R, code: code, byC: {} };
            var per = R.perDay ? rd.amount * Math.max(1, v.inDays || 1) : rd.amount;
            var cond = COND.test(rd.name), k = ci + (cond ? 'c' : ''), cur = h.byC[k];
            if (!cur || per > cur.est) h.byC[k] = { company: c.company, product: c.product, start: c.start, name: rd.name, amount: rd.amount, est: per, cond: cond, others: cur ? (cur.others || 0) + 1 : 0 };
            else cur.others = (cur.others || 0) + 1;
          });
        });
        Object.keys(hits).forEach(function (id) {
          var h = hits[id], items = Object.keys(h.byC).map(function (k) { return h.byC[k]; }).sort(function (a, b) { return a.cond - b.cond || b.est - a.est; });
          var dl = addYears(v.date, 3);
          flat.push({ key: id + '|' + v.key, kind: 'flat', cat: id, grp: h.R.grp, label: h.R.label, date: v.date, hosp: v.hospDisp, code: h.code.code, cname: h.code.name, inDays: v.inDays, inp: v.inp, items: items, amt: items.reduce(function (s, x) { return s + (x.cond ? 0 : x.est); }, 0), condAmt: items.reduce(function (s, x) { return s + (x.cond ? x.est : 0); }, 0), note: h.R.note, perDay: !!h.R.perDay, once: !!h.R.once, deadline: dl, left: days(today, dl) });
        });
      });
      flat.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    }
    return { plan: plan, silson: silson, flat: flat, hasCov: !!cov };
  }

  var api = { match: match, silsonPlan: silsonPlan, ruleOf: ruleOf, RULES: RULES, addYears: addYears };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Benefit = api;
})(this);
