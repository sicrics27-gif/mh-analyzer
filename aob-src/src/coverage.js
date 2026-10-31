// 보장분석 PDF(메리츠 M보장분석 / KB 보장분석) → 보유 계약·특약 목록 (브라우저/Node 공용)
(function (root) {
  function won(s) { // '1억5,000만' '5,000만' '20만' '1천' '85,340' → 원
    s = String(s || '').replace(/[,\s원]/g, '');
    if (!s || !/\d/.test(s)) return 0;
    var t = 0, m;
    if ((m = s.match(/(\d+(?:\.\d+)?)억/))) { t += parseFloat(m[1]) * 1e8; s = s.replace(m[0], ''); }
    if ((m = s.match(/(\d+(?:\.\d+)?)천만/))) { t += parseFloat(m[1]) * 1e7; s = s.replace(m[0], ''); }
    if ((m = s.match(/(\d+(?:\.\d+)?)만/))) { t += parseFloat(m[1]) * 1e4; s = s.replace(m[0], ''); }
    if ((m = s.match(/(\d+(?:\.\d+)?)천/))) { t += parseFloat(m[1]) * 1e3; s = s.replace(m[0], ''); }
    if ((m = s.match(/^(\d+)$/))) t += parseFloat(m[1]);
    return Math.round(t);
  }
  function ymd(s) { var m = String(s || '').match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; }
  var ROW = /^(\d{1,2})\s+(정액|실손|비례|기타)\s+(.+?)\s+((?:\d[\d,.]*\s*억)?\s*(?:\d[\d,.]*\s*천만)?\s*(?:\d[\d,.]*\s*만)?\s*(?:\d[\d,.]*\s*천)?\s*(?:\d[\d,]*)?)\s*원?$/;
  function rowOf(l) {
    var m = l.match(ROW); if (!m || !/\d/.test(m[4])) return null;
    return { type: m[2], name: m[3].replace(/\s+/g, ' ').trim(), amtText: m[4].replace(/\s+/g, ''), amount: won(m[4]) };
  }
  function kindOf(allText) {
    if (/상품별\s*보험가입현황/.test(allText) && /보장분석/.test(allText)) return 'meritz';
    if (/상품별\s*가입담보상세/.test(allText)) return 'kb';
    return '';
  }

  // pages: [[line, line, ...], ...]
  function parse(pages) {
    var all = pages.map(function (p) { return p.join('\n'); }).join('\n');
    var kind = kindOf(all); if (!kind) return null;
    var out = { kind: kind, asOf: '', name: '', birth: '', contracts: [] };
    var mAs = all.match(/(\d{4}[.\-]\d{2}[.\-]\d{2})\s+\d{2}:\d{2}:\d{2}/); if (mAs) out.asOf = ymd(mAs[1]);
    var mB = all.match(/(?:남|여)\s*\d+세\s*·\s*(\d{4}\.\d{2}\.\d{2})/); if (mB) out.birth = ymd(mB[1]).replace(/-/g, '');
    var mN = all.match(/^(\S+)\s*\((\d+)세\s*,\s*(남자|여자)\)/m); if (mN) { out.name = mN[1]; out.age = +mN[2]; out.sex = mN[3] === '남자' ? 'M' : 'F'; }
    var mN2 = all.match(/^(\S+)\s+고객님\s*$/m); if (!out.name && mN2) out.name = mN2[1];
    var cur = null;
    function push(c) {
      var prev = out.contracts.find(function (x) { return x.company === c.company && x.start === c.start && x.product === c.product; });
      if (prev) { prev.riders = prev.riders.concat(c.riders); return prev; }
      out.contracts.push(c); return c;
    }
    pages.forEach(function (lines) {
      var txt = lines.join('\n');
      if (kind === 'meritz') {
        var hi = lines.findIndex(function (l) { return /^별첨\s*상품별\s*보험가입현황/.test(l); });
        if (hi < 0) return;
        // 한 쪽에 계약이 여러 개일 수 있음: 회사 → 상품명 → 계약자/피보험자 → 보험기간·월 보험료 → 담보표
        var k = hi + 1, start = hi + 1;
        for (; k < lines.length; k++) {
          var l = lines[k].trim();
          if (/^계약자\/피보험자/.test(l)) {
            var block = lines.slice(start, k).map(function (x) { return x.trim(); }).filter(function (x) { return x && !/^\d+$|^\*|\||^가입담보명|^NO\s|보험기간/.test(x); });
            var company = block[0] || '', prod = block.slice(1).join('');
            var who = l.match(/계약자\/피보험자\s*(\S+)\s+납입주기\/납입기간\/만기\s*(.*)$/) || [];
            var pl = (lines[k + 1] || '');
            var per = pl.match(/보험기간\s*(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/) || [];
            var prem = pl.match(/월\s*보험료\s*([\d,]+)원/);
            cur = push({ company: company, product: prod, insured: who[1] || '', pay: (who[2] || '').trim(), start: ymd(per[1]), end: ymd(per[2]), premium: prem ? won(prem[1]) : 0, riders: [] });
            k++; start = k + 1; continue;
          }
          if (/^가입담보명|^NO\s+구분/.test(l)) { start = k + 1; continue; }
          var r = rowOf(l); if (r && cur) { cur.riders.push(r); start = k + 1; }
        }
      } else {
        if (/님의\s*담보별\s*가입\s*현황/.test(txt) || /님의\s*전체\s*보장현황/.test(txt)) { cur = null; return; }
        for (var i = 0; i < lines.length; i++) {
          var l = lines[i].trim();
          var h = l.match(/^(.+?)\s*\|\s*가입일자\s*:\s*(\d{4}-\d{2}-\d{2})\s*\|?/);
          if (h) {
            var product = (lines[i + 1] || '').trim(), k = i + 2;
            var who2 = (lines[k] || '').trim(); k++;
            var per2 = (lines[k] || '').match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s*(.*)$/);
            if (!per2) { product += (lines[i + 2] || '').trim(); who2 = (lines[i + 3] || '').trim(); k = i + 4; per2 = (lines[k] || '').match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s*(.*)$/); }
            var pm = per2 && per2[3].match(/([\d,]+)\s*원/);
            cur = push({ company: h[1].trim(), product: product, insured: (who2.split(/\s+/)[0] || '').replace(/^\//, ''), pay: who2.split(/\s+/).slice(1).join(' '), start: h[2], end: per2 ? per2[2] : '', premium: pm ? won(pm[1]) : 0, paidUp: per2 ? /납입완료/.test(per2[3]) : false, riders: [] });
            i = k; continue;
          }
          if (cur) { var r = rowOf(l); if (r) cur.riders.push(r); }
        }
      }
    });
    out.contracts.forEach(function (c) { c.silson = c.riders.some(function (r) { return r.type === '실손' && /의료비|입원|통원|외래/.test(r.name); }); });
    return out;
  }

  // 메리츠·KB 두 가지를 함께 넣었을 때 합치기 (같은 회사·가입일이면 특약이 더 많은 쪽)
  function co(s) { return String(s || '').replace(/\s|생명|손해보험|손보|화재|해상|보험|\(주\)|주식회사/g, '').slice(0, 2); }
  function merge(list) {
    var res = { kinds: [], asOf: '', name: '', birth: '', sex: '', contracts: [] };
    list.forEach(function (cv) {
      if (!cv) return;
      res.kinds.push(cv.kind); if (cv.asOf > res.asOf) res.asOf = cv.asOf;
      if (!res.birth && cv.birth) res.birth = cv.birth; if (!res.sex && cv.sex) res.sex = cv.sex;
      if (cv.name && (!res.name || /\*/.test(res.name))) res.name = cv.name;
      cv.contracts.forEach(function (c) {
        var same = res.contracts.find(function (x) { return x.start === c.start && co(x.company) === co(c.company) && (x.from || []).indexOf(cv.kind) < 0 && !x._taken; });
        if (!same) { res.contracts.push(Object.assign({ from: [cv.kind] }, c)); return; }
        same.from = (same.from || []).concat(cv.kind); same._taken = cv.kind;
        if (c.riders.length > same.riders.length) { same.riders = c.riders; same.product = c.product.length > same.product.length ? c.product : same.product; }
        if (!same.premium && c.premium) same.premium = c.premium;
        if (!same.end && c.end) same.end = c.end;
        same.silson = same.silson || c.silson;
      });
    });
    res.contracts.forEach(function (c) { delete c._taken; });
    res.contracts.sort(function (a, b) { return a.start < b.start ? 1 : -1; });
    return res;
  }

  // 실손 세대 (가입일 기준)
  function silsonGen(start) {
    if (!start) return 0;
    if (start < '2009-08-01') return 1;
    if (start < '2017-04-01') return 2;
    if (start < '2021-07-01') return 3;
    if (start < '2026-05-01') return 4;
    return 5;
  }

  var api = { parse: parse, merge: merge, silsonGen: silsonGen, won: won };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Coverage = api;
})(this);
