// ===== 질병예측(건강검진) 분석 + 화면 =====
// HealthAnalyze: 계산만 (페이지 안에서 실행). HealthUI: 화면 그리기 (페이지와 다운로드 리포트 양쪽에서 실행되도록 외부 의존 없음)
function HealthAnalyze(all, checkup, sex) {
  var KEYS = [
    ['bp', /혈압/, '혈압', 'mmHg'], ['fbs', /식전혈당|공복혈당/, '공복혈당', 'mg/dL'], ['tc', /총콜레/, '총콜레스테롤', 'mg/dL'],
    ['ldl', /LDL/, 'LDL 콜레스테롤', 'mg/dL'], ['hdl', /HDL/, 'HDL 콜레스테롤', 'mg/dL'], ['tg', /중성지방/, '중성지방', 'mg/dL'],
    ['ast', /^AST/, 'AST', 'U/L'], ['alt', /^ALT/, 'ALT', 'U/L'], ['ggt', /감마/, '감마지피티', 'U/L'],
    ['gfr', /신사구체/, '사구체여과율(GFR)', 'mL/min'], ['cr', /크레아티닌/, '혈청크레아티닌', 'mg/dL'], ['up', /요단백/, '요단백', ''],
    ['bmi', /체질량/, '체질량지수(BMI)', 'kg/㎡'], ['waist', /허리/, '허리둘레', 'cm'], ['hb', /혈색소/, '혈색소', 'g/dL'],
    ['ht', /^신장$/, '신장', 'cm'], ['wt', /체중/, '체중', 'kg']
  ];
  var F = sex === 'F';
  function n(v) { var x = parseFloat(String(v).replace(/[^\d.]/g, '')); return isNaN(x) ? null : x; }
  function J(k, v) {
    var x = n(v);
    if (k === 'bp') { var p = String(v).split('/').map(function (t) { return parseFloat(t); }); var s = p[0], d = p[1] || 0; if (!s) return null;
      if (s >= 160 || d >= 100) return [2, '고혈압 의심(2기)']; if (s >= 140 || d >= 90) return [2, '고혈압 의심']; if (s >= 130 || d >= 80) return [1, '고혈압 전단계']; if (s >= 120) return [1, '주의 혈압']; return [0, '정상']; }
    if (k === 'up') { if (/약양성/.test(v)) return [1, '약양성']; if (/양성/.test(v)) return [2, '양성']; if (/음성/.test(v)) return [0, '음성']; return null; }
    if (x === null) return null;
    switch (k) {
      case 'fbs': return x >= 126 ? [2, '당뇨 의심'] : x >= 100 ? [1, '공복혈당장애'] : [0, '정상'];
      case 'tc': return x >= 240 ? [2, '높음'] : x >= 200 ? [1, '경계'] : [0, '정상'];
      case 'ldl': return x >= 160 ? [2, '높음'] : x >= 130 ? [1, '경계'] : [0, '정상'];
      case 'hdl': return x < 40 ? [1, '낮음'] : x >= 60 ? [0, '좋음'] : [0, '정상'];
      case 'tg': return x >= 200 ? [2, '높음'] : x >= 150 ? [1, '경계'] : [0, '정상'];
      case 'ast': case 'alt': return x > 80 ? [2, '높음'] : x > 40 ? [1, '경계'] : [0, '정상'];
      case 'ggt': var g = F ? 35 : 63; return x > g * 2 ? [2, '높음'] : x > g ? [1, '경계'] : [0, '정상'];
      case 'gfr': return x < 60 ? [2, '신기능 저하'] : x < 90 ? [1, '경도 감소'] : [0, '정상'];
      case 'cr': return x > 1.5 ? [2, '높음'] : x > 1.2 ? [1, '경계'] : [0, '정상'];
      case 'bmi': return x >= 30 ? [2, '고도비만'] : x >= 25 ? [1, '비만'] : x >= 23 ? [1, '과체중'] : x < 18.5 ? [1, '저체중'] : [0, '정상'];
      case 'waist': return x >= (F ? 85 : 90) ? [1, '복부비만'] : [0, '정상'];
      case 'hb': var lo = F ? 12 : 13; return x < lo - 2 ? [2, '빈혈 의심'] : x < lo ? [1, '경계'] : [0, '정상'];
    }
    return [-1, ''];
  }
  var items = (all && all.items) || {}, years = ((all && all.years) || []).map(function (y) { return y.y; });
  var rows = KEYS.map(function (K) {
    var label = Object.keys(items).filter(function (l) { return K[1].test(l.replace(/\s/g, '')); })[0];
    if (!label) return null;
    var vals = {};
    years.forEach(function (y) { var v = items[label].vals[y]; if (v) { var j = J(K[0], v) || [-1, '']; vals[y] = { v: v, lv: j[0], lab: j[1] }; } });
    return { k: K[0], name: K[2], unit: K[3], vals: vals };
  }).filter(Boolean);
  var by = {}; rows.forEach(function (r) { by[r.k] = r; });
  function get(y, k) { return by[k] && by[k].vals[y]; }
  function num(y, k) { var c = get(y, k); return c ? n(c.v) : null; }
  var GROUPS = [['비만', 'BMI·허리둘레', ['bmi', 'waist']], ['혈당', '공복혈당', ['fbs']], ['심혈관', '혈압·콜레스테롤', ['bp', 'tc', 'ldl', 'hdl', 'tg']], ['간', 'AST·ALT·γGTP', ['ast', 'alt', 'ggt']], ['신장', 'GFR·크레아티닌·요단백', ['gfr', 'cr', 'up']]];
  var GUIDE = {
    '비만': ['체중·허리둘레 관리(식사량 조절, 주 150분 이상 유산소 운동)', '신장·체중은 청약서 고지 항목입니다. 일부 상품은 BMI 기준으로 인수가 제한될 수 있습니다.'],
    '혈당': ['당화혈색소(HbA1c) 검사로 당뇨 여부를 확인하세요', '당뇨 진단·투약 이력은 11대 질병 고지 대상입니다. 혈당 재검사·추가검사 소견을 받았다면 확인이 필요합니다.'],
    '심혈관': ['저염식, 규칙적 운동, 금연·절주. 수치가 계속 높으면 내과 진료 권장', '고혈압 진단·투약은 11대 질병 고지 대상이고, 고지혈증 약 복용은 30일 이상 투약·3개월 이내 투약 질문에 해당할 수 있습니다.'],
    '간': ['음주·체중 관리, 복부 초음파로 지방간 여부 확인 권장', '간 수치 이상으로 초음파 등 추가검사를 받았다면 1년 이내 추가검사 질문을 확인하세요.'],
    '신장': ['수분 섭취, 혈압·혈당 관리, 정기적인 신장기능 검사 권장', '신장 질환 진단이나 소변·신장 재검사 소견 여부를 확인하세요.']
  };
  function yearData(y) {
    var organs = GROUPS.map(function (G) {
      var cells = G[2].map(function (k) { return get(y, k); }).filter(function (c) { return c && c.lv >= 0; });
      if (!cells.length) return { name: G[0], sub: G[1], score: null };
      var s = 100; cells.forEach(function (c) { s -= c.lv === 2 ? 30 : c.lv === 1 ? 12 : 0; });
      s = Math.max(20, s);
      return { name: G[0], sub: G[1], score: s, tone: s >= 85 ? 'g' : s >= 65 ? 'a' : 'r', lbl: s >= 85 ? '양호' : s >= 65 ? '주의' : '위험' };
    });
    var bp = get(y, 'bp'), sb = bp ? parseFloat(String(bp.v).split('/')[0]) : null, db = bp ? parseFloat(String(bp.v).split('/')[1]) : null;
    var fbs = num(y, 'fbs'), bmi = num(y, 'bmi'), tc = num(y, 'tc'), ldl = num(y, 'ldl'), hdl = num(y, 'hdl'), tg = num(y, 'tg');
    var ast = num(y, 'ast'), alt = num(y, 'alt'), ggt = num(y, 'ggt'), gfr = num(y, 'gfr'), up = get(y, 'up');
    function cl(v) { return Math.max(1, Math.min(10, Math.round(v))); }
    var risks = [];
    risks.push({ name: '고혈압', sub: '혈압', level: sb == null ? null : cl((sb >= 160 || db >= 100 ? 9 : sb >= 140 || db >= 90 ? 8 : sb >= 130 || db >= 80 ? 6 : sb >= 120 ? 4 : 2) + (bmi >= 25 ? 1 : 0)) });
    risks.push({ name: '당뇨병', sub: '공복혈당', level: fbs == null ? null : cl((fbs >= 140 ? 9 : fbs >= 126 ? 8 : fbs >= 110 ? 6 : fbs >= 100 ? 4 : fbs >= 90 ? 2 : 1) + ((bmi >= 25 || tg >= 150) ? 1 : 0)) });
    var lipid = [tc != null ? (tc >= 240 ? 8 : tc >= 200 ? 5 : 2) : null, ldl != null ? (ldl >= 160 ? 8 : ldl >= 130 ? 5 : 2) : null, tg != null ? (tg >= 200 ? 7 : tg >= 150 ? 5 : 2) : null, hdl != null ? (hdl < 40 ? 5 : 1) : null].filter(function (v) { return v != null; });
    risks.push({ name: '고지혈증', sub: '콜레스테롤·중성지방', level: lipid.length ? cl(Math.max.apply(null, lipid)) : null });
    var lv = [ast, alt].filter(function (v) { return v != null; });
    risks.push({ name: '간질환', sub: '간수치·지방간', level: lv.length || ggt != null ? cl(Math.max(Math.max.apply(null, lv.concat([0])) > 80 ? 8 : Math.max.apply(null, lv.concat([0])) > 40 ? 5 : 2, ggt != null ? (ggt > (F ? 70 : 126) ? 8 : ggt > (F ? 35 : 63) ? 5 : 2) : 0) + (bmi >= 25 ? 1 : 0)) : null });
    risks.push({ name: '신장질환', sub: 'GFR·요단백', level: gfr == null ? null : cl((gfr < 45 ? 9 : gfr < 60 ? 7 : gfr < 75 ? 5 : gfr < 90 ? 3 : 1) + (up && up.lv === 2 ? 2 : up && up.lv === 1 ? 1 : 0)) });
    risks.push({ name: '비만', sub: 'BMI', level: bmi == null ? null : cl(bmi >= 30 ? 8 : bmi >= 25 ? 6 : bmi >= 23 ? 4 : 2) });
    var rf = 0, known = 0;
    if (sb != null) { known++; if (sb >= 130 || db >= 80) rf++; }
    if (fbs != null) { known++; if (fbs >= 100) rf++; }
    if (ldl != null || tc != null) { known++; if (ldl >= 130 || tc >= 200) rf++; }
    if (hdl != null) { known++; if (hdl < 40) rf++; }
    if (bmi != null) { known++; if (bmi >= 25) rf++; }
    risks.push({ name: '심뇌혈관질환', sub: '위험요인 ' + rf + '개', level: known ? cl(1 + rf * 2) : null });
    risks.forEach(function (r) { if (r.level == null) return; r.tone = r.level <= 2 ? 'g' : r.level <= 4 ? 'y' : r.level <= 6 ? 'a' : r.level <= 8 ? 'o' : 'r'; r.lbl = r.level <= 2 ? '낮음' : r.level <= 4 ? '보통' : r.level <= 6 ? '주의' : r.level <= 8 ? '높음' : '매우 높음'; });
    var warns = [];
    GROUPS.forEach(function (G) {
      var bad = G[2].map(function (k) { var c = get(y, k); return c && c.lv >= 1 ? { k: k, c: c } : null; }).filter(Boolean);
      if (!bad.length) return;
      var worst = Math.max.apply(null, bad.map(function (b) { return b.c.lv; }));
      warns.push({ title: G[0] + ' 관리 필요', lv: worst, vals: bad.map(function (b) { return by[b.k].name + ' ' + b.c.v + ' (' + b.c.lab + ')'; }), guide: GUIDE[G[0]][0], ins: GUIDE[G[0]][1] });
    });
    warns.sort(function (a, b) { return b.lv - a.lv; });
    return { organs: organs, risks: risks, warns: warns };
  }
  var per = {}; years.forEach(function (y) { per[y] = yearData(y); });
  var dates = {}; ((all && all.years) || []).forEach(function (y) { dates[y.y] = y.d; });
  return { years: years, dates: dates, rows: rows, per: per, sex: sex || '', opinion: (checkup && checkup.lines) || [], checkDate: (checkup && checkup.date) || '' };
}

function HealthUI(root, H) {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  if (!H || !H.years || !H.years.length) { root.innerHTML = '<div class="empty">건강검진 자료가 없습니다. 공단 "검진결과 한눈에 보기" PDF를 함께 올리면 질병예측 분석이 나옵니다.</div>'; return; }
  var cur = H.years[H.years.length - 1];
  function ring(s, tone) {
    var r = 36, C = 2 * Math.PI * r, d = s == null ? 0 : C * s / 100;
    return '<svg viewBox="0 0 88 88" class="ring t-' + (tone || 'n') + '" aria-hidden="true"><circle cx="44" cy="44" r="' + r + '" class="ring-bg"/><circle cx="44" cy="44" r="' + r + '" class="ring-fg" stroke-dasharray="' + d.toFixed(1) + ' ' + (C - d).toFixed(1) + '" transform="rotate(-90 44 44)"/><text x="44" y="51" text-anchor="middle">' + (s == null ? '–' : s) + '</text></svg>';
  }
  function top() {
    var Y = H.per[cur];
    var h = '<div class="hp-years" role="tablist">' + H.years.map(function (y) { return '<button type="button" class="hp-y" data-y="' + y + '" aria-pressed="' + (y === cur) + '">' + y + '<small>' + esc(H.dates[y] || '') + '</small></button>'; }).join('') + '</div>';
    h += '<div class="hp-h"><h4>계통별 건강 점수</h4><span>' + cur + '년 검진 수치 기준 · 100점 만점</span></div><div class="hp-organs">' + Y.organs.map(function (o) { return '<div class="hp-organ">' + ring(o.score, o.tone) + '<b>' + esc(o.name) + '</b><small>' + esc(o.sub) + '</small>' + (o.score == null ? '<span class="tag t-n">자료 없음</span>' : '<span class="tag t-' + o.tone + '">' + o.lbl + '</span>') + '</div>'; }).join('') + '</div>';
    h += '<div class="hp-h"><h4>질환 위험도</h4><span>검진 수치로 본 1~10단계 · 참고용</span></div><div class="hp-risks">' + Y.risks.map(function (r) {
      var seg = ''; for (var i = 1; i <= 10; i++) seg += '<i class="' + (r.level != null && i <= r.level ? 'on s' + i : '') + '"></i>';
      return '<div class="hp-risk"><div class="hp-rt"><b>' + esc(r.name) + '</b><small>' + esc(r.sub) + '</small></div><div class="gauge">' + seg + '</div><div class="hp-rf">' + (r.level == null ? '<span class="tag t-n">자료 없음</span>' : '<span class="tag t-' + r.tone + '">' + r.lbl + '</span><span class="lvn">' + r.level + '<small>/10</small></span>') + '</div></div>';
    }).join('') + '</div>';
    h += '<div class="hp-h"><h4>경고 신호 · 관리 가이드 · 보험 체크</h4><span>' + cur + '년</span></div>';
    h += Y.warns.length ? '<div class="hp-warns">' + Y.warns.map(function (w) { return '<div class="hp-warn lv' + w.lv + '"><div class="hp-wl"><b>' + esc(w.title) + '</b>' + w.vals.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div><div class="hp-wr"><small>관리 가이드</small><p>' + esc(w.guide) + '</p><small>보험 체크</small><p>' + esc(w.ins) + '</p></div></div>'; }).join('') + '</div>' : '<div class="empty">이 해에는 관리가 필요한 수치가 없습니다.</div>';
    return h;
  }
  function table() {
    var ys = H.years;
    var h = '<div class="hp-h"><h4>연도별 검진 수치</h4><span>▲▼ 직전 검진 대비 · 빨강 질환 의심 · 주황 경계</span></div><div class="tw"><table class="t hp-t"><thead><tr><th>항목</th>' + ys.map(function (y) { return '<th class="mono">' + y + '<br><small>' + esc(H.dates[y] || '') + '</small></th>'; }).join('') + '<th>단위</th></tr></thead><tbody>';
    H.rows.forEach(function (r) {
      var prev = null;
      h += '<tr><td>' + esc(r.name) + '</td>' + ys.map(function (y) {
        var c = r.vals[y]; if (!c) return '<td class="n dim">-</td>';
        var x = parseFloat(String(c.v)), ar = '';
        if (prev != null && !isNaN(x) && r.k !== 'ht') ar = x > prev ? '<em class="up">▲</em>' : x < prev ? '<em class="dn">▼</em>' : '';
        if (!isNaN(x)) prev = x;
        return '<td class="n' + (c.lv === 2 ? ' v-red' : c.lv === 1 ? ' v-amb' : '') + '">' + esc(c.v) + ar + (c.lv >= 1 ? '<br><small>' + esc(c.lab) + '</small>' : '') + '</td>';
      }).join('') + '<td><small class="note">' + esc(r.unit) + '</small></td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function opinion() {
    if (!H.opinion.length) return '';
    return '<div class="hp-op"><b>건강검진 결과통보서 소견' + (H.checkDate ? ' · ' + esc(H.checkDate) : '') + '</b>' + H.opinion.map(function (l) { var hot = /유질환|질환\s*의심|의심\s*질환|재검|추적|수치\s*이상|소견/.test(l) && !/^생활습관/.test(l); return '<p' + (hot ? ' class="hot"' : '') + '>' + esc(l) + '</p>'; }).join('') + '<small>"재검사·추적관찰" 소견은 1년 이내 추가검사 질문, "유질환"은 진단·투약 고지와 연결해서 확인하세요.</small></div>';
  }
  function draw() { root.innerHTML = opinion() + '<div class="hp-top">' + top() + '</div>' + table(); }
  draw();
  root.addEventListener('click', function (e) { var b = e.target.closest('.hp-y'); if (!b) return; cur = b.getAttribute('data-y'); draw(); });
}

