// 전 상품 판정표: 한 번 분석으로 상품별 고지 질문 결과 계산 (브라우저/Node 공용)
(function (root) {
  var A = root.Analyzer || (typeof require !== 'undefined' ? require('./analyzer.js') : null);

  var K_STD5 = ['입원', '수술', '시술', '7일이상', '30일이상'];
  var K_INS = ['입원', '수술', '시술'];
  var K_INS7 = ['입원', '수술', '시술', '7일이상'];

  var PRODUCTS = [
    { id: 'std', title: '표준체 3.3.1.5.5', short: '표준체', run: 'std', lines: ['m3', 'ex1', 'std5', 'm11'] },
    { id: 's355', title: '간편체 3.5.5', short: '3.5.5', run: 's5', lines: ['m3', 'ins', 'six'] },
    { id: 's3105', title: '간편체 3.10.5', short: '3.10.5', run: 's10', lines: ['m3', 'ins', 'six'] },
    { id: 's345', title: '간편체 3.4.5', short: '3.4.5', run: 's4', lines: ['m3', 'ins', 'six'] },
    { id: 's335', title: '간편체 3.3.5', short: '3.3.5', run: 's3', lines: ['m3', 'ins', 'six'] },
    { id: 's325', title: '간편체 3.2.5', short: '3.2.5', run: 's2', lines: ['m3', 'ins', 'six'] },
    { id: 's315', title: '간편체 3.1.5', short: '3.1.5', run: 's1', lines: ['m3', 'ins', 'six'] },
    { id: 's305', title: '간편체 3.0.5', short: '3.0.5', run: 's0', lines: ['m3', 'six'] },
    { id: 's311', title: '간편체 3.1.1', short: '3.1.1', run: 's11', lines: ['m3', 'ins', 'six'] },
    { id: 's31', title: '간편체 3.1', short: '3.1', run: 's10x', lines: ['m3', 'ins'] },
    { id: 'silStd', title: '표준체 실손의료비', short: '표준체 실손', run: 'std', lines: ['m3', 'ex1', 'std5', 'm11'] },
    { id: 'silSick', title: '유병자 실손의료비', short: '유병자 실손', run: 'sick', lines: ['m3ins', 'ins7', 'cancer'] },
    { id: 'silOld', title: '노후 실손의료비', short: '노후 실손', run: 'std', lines: ['m3', 'ex1', 'std5', 'm11'] },
    { id: 'drvStd', title: '표준체 운전자보험', short: '표준체 운전자', run: 'std', lines: ['m3', 'ex1', 'std5', 'm11'] },
    { id: 'drvSim', title: '간편체 운전자보험', short: '간편 운전자', run: 's00', lines: ['m3'] }
  ];
  var RUNS = {
    std: { mode: 'std' },
    s5: { mode: 'simple', N: 5, M: 5 }, s10: { mode: 'simple', N: 10, M: 5 }, s4: { mode: 'simple', N: 4, M: 5 },
    s3: { mode: 'simple', N: 3, M: 5 }, s2: { mode: 'simple', N: 2, M: 5 }, s1: { mode: 'simple', N: 1, M: 5 },
    s0: { mode: 'simple', N: 0, M: 5 }, s11: { mode: 'simple', N: 1, M: 1 }, s10x: { mode: 'simple', N: 1, M: 0 },
    s00: { mode: 'simple', N: 0, M: 0 },
    sick2: { mode: 'std', years: 2 }
  };

  function filterInput(input, from) {
    var f = function (a) { return (a || []).filter(function (r) { return r.date && r.date > from; }); };
    return { basic: f(input.basic), detail: f(input.detail), rx: f(input.rx), recent: input.recent ? { rows: f(input.recent.rows), period: input.recent.period } : null };
  }
  function runCfg(input, key, base) {
    var c = RUNS[key];
    if (c.years) {
      var from = A.fmt(A.addM(A.pd(base), -12 * c.years));
      var R = A.analyze(filterInput(input, from), { mode: c.mode, baseDate: base });
      R.windowYears = c.years;
      return R;
    }
    return A.analyze(input, { mode: c.mode, N: c.N, M: c.M, baseDate: base });
  }

  function hasK(c, ks, lv) { return c.disc.some(function (d) { return ks.indexOf(d.k) >= 0 && (!lv || d.lv === lv); }); }
  function countK(R, ks) {
    var all = R.main.concat(R.check);
    var y = all.filter(function (c) { return hasK(c, ks, 'y'); });
    var cc = all.filter(function (c) { return !hasK(c, ks, 'y') && hasK(c, ks); });
    return { y: y.length, c: cc.length };
  }
  function isCancer(c) { var n = A.std11(c.code); return /^암|백혈병/.test(n); }
  function cancerSus(c) { var s = A.majorSuspect(c.code); return /암/.test(s); }

  // 상품 하나의 질문별 결과
  function lineResult(id, R, ctx, p) {
    var N = R.N, M = R.M, n;
    switch (id) {
      case 'm3': n = R.recent3mCards.length; return { label: '3개월 내 진료·투약', y: n, c: 0 };
      case 'ex1': n = countK(R, ['정밀']); return { label: '1년 내 추가검사·재검사', y: n.y, c: n.c };
      case 'std5': n = countK(R, K_STD5); return { label: '5년 내 입원·수술·7일↑ 치료·30일↑ 투약', y: n.y, c: n.c };
      case 'm11': n = countK(R, ['질병']); return { label: '5년 내 11대 질병', y: n.y, c: n.c };
      case 'ins': n = countK(R, K_INS); return { label: N + '년 내 입원·수술', y: n.y, c: n.c };
      case 'six': n = countK(R, ['질병']); return { label: M + '년 내 6대 질병', y: n.y, c: n.c };
      case 'm3ins': {
        var d3 = R.from3m;
        var all = ctx.std.main.concat(ctx.std.check, ctx.std.extra);
        var y = all.filter(function (c) { return c.visits.some(function (v) { return v.inp && v.date >= d3; }) || c.surg.some(function (s) { return s.date >= d3; }); }).length;
        var ex = all.filter(function (c) { return c.exams.some(function (e) { return e.date >= d3; }); }).length;
        var cc = y ? 0 : (ex || ctx.std.recent3mCards.length ? Math.max(ex, ctx.std.recent3mCards.length) : 0);
        return { label: '3개월 내 입원·수술·추가검사 소견', y: y, c: cc, note: cc ? '최근 3개월 진료가 있습니다. 입원·수술·추가검사 소견이 있었는지 고객에게 확인하세요.' : '' };
      }
      case 'ins7': n = countK(ctx.sick2, K_INS7); return { label: '2년 내 입원·수술·7일↑ 치료', y: n.y, c: n.c };
      case 'cancer': {
        var al = ctx.std.main.concat(ctx.std.check, ctx.std.extra);
        return { label: '5년 내 암', y: al.filter(isCancer).length, c: al.filter(function (c) { return !isCancer(c) && cancerSus(c); }).length };
      }
    }
    return { label: id, y: 0, c: 0 };
  }

  // 상세 보기용: 상품 질문에 해당하는 항목만 남긴 결과
  function cloneCard(c, ks, extraTest) {
    var disc = c.disc.filter(function (d) { return ks.indexOf(d.k) >= 0 || (extraTest && extraTest(d, c)); });
    return Object.assign({}, c, { disc: disc, tier: disc.some(function (d) { return d.lv === 'y'; }) ? 'disc' : disc.length ? 'check' : 'none' });
  }
  function regroup(R, cards, extra) {
    var byLast = function (a, b) { return b.last < a.last ? -1 : 1; };
    var out = Object.assign({}, R);
    out.main = cards.filter(function (c) { return c.tier === 'disc'; }).sort(byLast);
    out.check = cards.filter(function (c) { return c.tier === 'check'; }).sort(byLast);
    out.extra = cards.filter(function (c) { return c.tier === 'none'; }).concat(extra || []).sort(byLast);
    out.extra.forEach(function (c) { if (!c.reason) c.reason = '이 상품 질문에 해당하지 않음'; });
    return out;
  }
  function detailR(p, ctx) {
    var R = ctx[p.run];
    if (p.id === 'silSick') {
      var A2 = ctx.sick2;
      var cards = A2.main.concat(A2.check).map(function (c) { return cloneCard(c, K_INS7); });
      var seen = {}; cards.forEach(function (c) { seen[c.code] = 1; });
      ctx.std.main.concat(ctx.std.check, ctx.std.extra).forEach(function (c) {
        if (seen[c.code] || !(isCancer(c) || cancerSus(c))) return;
        var cc = cloneCard(c, [], function (d) { return d.k === '질병'; });
        if (!cc.disc.length) cc = Object.assign({}, cc, { disc: [{ lv: isCancer(c) ? 'y' : 'c', k: '질병', t: isCancer(c) ? '암(5년 이내)' : '암 관련 확인 — ' + A.majorSuspect(c.code), q: c.name + ' 진단 이후 암 확진이나 추적검사를 받으신 적이 있나요?' }] });
        cc.tier = cc.disc.some(function (d) { return d.lv === 'y'; }) ? 'disc' : 'check';
        cards.push(cc);
      });
      var out = regroup(ctx.std, cards.filter(function (c) { return c.tier !== 'none'; }), cards.filter(function (c) { return c.tier === 'none'; }));
      out.productNote = '유병자 실손: 3개월 내 입원·수술·추가검사 소견 / 2년 내 입원·수술·계속 7일 이상 치료 / 5년 내 암';
      out.mode = 'std'; out.sick = true;
      return out;
    }
    if (p.id === 'drvSim') {
      var all = R.main.concat(R.check).map(function (c) { return cloneCard(c, []); });
      return regroup(R, [], all);
    }
    return R;
  }

  function evaluate(input, base) {
    var ctx = {};
    Object.keys(RUNS).forEach(function (k) { ctx[k] = runCfg(input, k, base); });
    ctx.sick = ctx.std;
    var res = PRODUCTS.map(function (p) {
      var R = ctx[p.run];
      var lines = p.lines.map(function (l) { return lineResult(l, R, ctx, p); });
      var st = lines.some(function (l) { return l.y; }) ? 'y' : lines.some(function (l) { return l.c; }) ? 'c' : 'n';
      return { id: p.id, title: p.title, short: p.short, lines: lines, status: st };
    });
    return { ctx: ctx, products: res };
  }
  function summaryLine(products) {
    var free = products.filter(function (p) { return p.status === 'n'; });
    if (!free.length) return { text: '전 상품 심사 필요', ok: false };
    return { text: '무심사 가입 가능 : ' + free[0].short + (free.length > 1 ? ' 외 ' + (free.length - 1) + '종' : ''), ok: true };
  }

  var api = { PRODUCTS: PRODUCTS, evaluate: evaluate, detailR: detailR, summaryLine: summaryLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Products = api;
})(this);
