// 병력 고지 판정 엔진 (브라우저/Node 공용)
(function (root) {
  // ---------- 날짜 ----------
  function pd(s) { var t = String(s || '').trim(); var m = t.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/) || t.match(/^(\d{4})(\d{2})(\d{2})$/); return m ? new Date(Date.UTC(+m[1], +m[2]-1, +m[3])) : null; }
  function fmt(d) { return d.toISOString().slice(0, 10); }
  function short(s) { return String(s).slice(2); } // 22-12-20
  function addM(d, months) { var r = new Date(d.getTime()); var day = r.getUTCDate(); r.setUTCDate(1); r.setUTCMonth(r.getUTCMonth() + months); var last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth()+1, 0)).getUTCDate(); r.setUTCDate(Math.min(day, last)); return r; }
  function num(s) { var n = parseFloat(String(s || '').replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; }

  // ---------- 상병코드 ----------
  function normCode(raw) {
    var s = String(raw || '').replace(/\s/g, '').toUpperCase();
    if (!s || s === '$' || !/^[A-Z]/.test(s)) return { code: '', src: '' };
    var src = '';
    if (/^[AB][A-Z]\d/.test(s)) { src = s[0] === 'A' ? '양방' : '한방'; s = s.slice(1); }
    return { code: s.length > 3 ? s.slice(0, 3) + '.' + s.slice(3) : s, src: src };
  }
  function cleanName(n) { return String(n || '').replace(/^\((양방|한방)\)\s*/, '').trim(); }
  function c3(code) { return code.replace('.', '').slice(0, 3); }
  function inRange(code, a, b) { var k = c3(code); return k >= a && k <= b; }
  function startsAny(code, list) { var k = code.replace('.', ''); return list.some(function (p) { return k.indexOf(p) === 0; }); }

  // 표준체 11대 질병
  function std11(code) {
    if (!code) return '';
    if (inRange(code, 'C91', 'C95')) return '백혈병';
    if (inRange(code, 'C00', 'C97')) return '암';
    if (inRange(code, 'D00', 'D09')) return '암(제자리암)';
    if (inRange(code, 'D37', 'D48')) return '암(경계성종양)';
    if (inRange(code, 'I10', 'I15') || startsAny(code, ['R030'])) return '고혈압';
    if (c3(code) === 'I20') return '협심증';
    if (inRange(code, 'I21', 'I23') || startsAny(code, ['I252'])) return '심근경색';
    if (inRange(code, 'I05', 'I08') || inRange(code, 'I34', 'I39')) return '심장판막증';
    if (startsAny(code, ['K703', 'K717', 'K74'])) return '간경화';
    if (inRange(code, 'I60', 'I64') || c3(code) === 'I69') return '뇌졸중';
    if (inRange(code, 'E10', 'E14') || startsAny(code, ['H360'])) return '당뇨병';
    if (inRange(code, 'B20', 'B24') || c3(code) === 'Z21') return '에이즈(HIV)';
    if (inRange(code, 'K60', 'K62') || c3(code) === 'K64' || c3(code) === 'I84') return '직장·항문 질환';
    return '';
  }
  // 중대질병과 관련 있지만 보험사마다 판단이 갈리는 상병 (확인 필요)
  function majorSuspect(code) {
    if (!code) return '';
    if (startsAny(code, ['Z030', 'Z031'])) return '암 의심(관찰)';
    if (startsAny(code, ['Z033'])) return '신경계(뇌) 질환 의심(관찰)';
    if (startsAny(code, ['Z034', 'Z035'])) return '심장질환 의심(관찰)';
    if (c3(code) === 'G45' || c3(code) === 'G46') return '일과성 뇌허혈·뇌혈관 증후군';
    if (inRange(code, 'I65', 'I68')) return '뇌혈관 질환(뇌졸중 범위 확인)';
    if (inRange(code, 'I24', 'I25') && !startsAny(code, ['I252'])) return '허혈성 심장질환(협심증·심근경색 범위 확인)';
    if (inRange(code, 'I44', 'I49')) return '부정맥·전도장애(심장질환 범위 확인)';
    if (inRange(code, 'I50', 'I51')) return '심부전·기타 심장질환';
    if (startsAny(code, ['R73', 'R81'])) return '고혈당·당뇨 의심';
    if (startsAny(code, ['K70', 'K71', 'K72', 'K73', 'K75', 'K76'])) return '간질환(간경화 진행 여부 확인)';
    if (startsAny(code, ['R91', 'R92', 'R93', 'R94', 'N63', 'R22', 'R59'])) return '이상 소견·종괴(암 감별 확인)';
    if (startsAny(code, ['K635', 'K638'])) return '결장 용종(직장·항문질환 범위 확인)';
    if (inRange(code, 'D10', 'D36')) return '양성 종양(추적관찰 여부 확인)';
    return '';
  }
  function chronicHD(code) { // 고혈압·당뇨·고지혈증
    if (!code) return '';
    if (inRange(code, 'I10', 'I15') || startsAny(code, ['R030'])) return '고혈압';
    if (inRange(code, 'E10', 'E14') || startsAny(code, ['H360', 'R73'])) return '당뇨';
    if (c3(code) === 'E78') return '고지혈증';
    return '';
  }
  // 간편 6대 질병
  function simple6(code) {
    if (startsAny(code, ['Z034'])) return '심근경색(의심·관찰)';
    var n = std11(code);
    if (n === '암' || n === '백혈병' || n === '암(제자리암)') return n === '백혈병' ? '암(백혈병)' : n;
    if (n === '협심증' || n === '심근경색' || n === '심장판막증' || n === '간경화' || n === '뇌졸중') return n;
    return '';
  }

  // ---------- 진료내역 분류 ----------
  var SURG_RE = /수술|절제술|적출술|성형술|봉합술|고정술|치환술|이식술|절개술|배액술|결찰술|재건술|교정술|접합술|관혈적|형성술|박리술|천공술|삽입술|폐쇄술|우회술|중재술|색전술|용종절제|점막절제|제거술|발거술|쇄석술|절석술|광응고술|임플란트.*식립|조갑|침생검|재소파술|유방생검|소작술/;
  var SURG_EX = /수술후처치|발치술|치석|치근활택|치주소파|구강내소염|치관확장|약물소작|첩모발거|드레싱|BURR|SAW|NEEDLE|SNARE|CLIP|FORCEPS|재료|소모품|단순처치|처치\[|창상처치|기본진료료|이구전색/i;
  var PROC_RE = /주입술|흡인술|천자|생검|레이저|체외충격파|고주파|소작|구강내소염|치관확장|첩모발거|매복|봉합|절개|적출|제거/;
  var PROC_EX = /BURR|SAW|NEEDLE|SNARE|CLIP|FORCEPS|재료|소모품|드레싱|기본진료료|이구전색|치석|조직병리|검사료|차단술|신경블록|전달마취|침윤마취|재활|저출력레이저|수복물|보철물|계측|지각과민|단순처치/i;
  var EXAM_RE = /\bCT\b|CT진단|MRI|자기공명|전산화단층|초음파|내시경|조직병리|생검|PET-?CT|혈관조영|골밀도|심초음파|뇌파|근전도|유방촬영|조영/;
  var EXAM_EX = /세척|소독|재료|NEEDLE|SNARE|CLIP|소모/i;
  function isPharm(h, dept) { return /약국$|약국\s*$/.test(h) || (/약국/.test(h) && /일반의/.test(dept || '')); }

  // ---------- 원본 표 -> 레코드 ----------
  function rowsToRecords(rows, need) {
    // 헤더 찾기
    var out = [], hdr = null;
    rows.forEach(function (r) {
      if (r[0] === '순번') { hdr = r; return; }
      if (!hdr || !/^\d+$/.test(r[0] || '')) return;
      var o = {};
      hdr.forEach(function (h, i) { o[h.replace(/\s/g, '')] = (r[i] || '').trim(); });
      out.push(o);
    });
    return out;
  }
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) { for (var k in o) if (k.indexOf(keys[i]) === 0) return o[k]; } return ''; }

  function buildBasic(rows) {
    return rowsToRecords(rows).map(function (o) {
      var c = normCode(pick(o, ['주상병코드']));
      return { date: (pd(pick(o, ['진료시작일'])) ? fmt(pd(pick(o, ['진료시작일']))) : ''), hosp: pick(o, ['병·의원']).replace(/\s+/g, ''), hospDisp: pick(o, ['병·의원']), dept: pick(o, ['진단과']), type: pick(o, ['입원/외래', '입원']), code: c.code, src: c.src, name: cleanName(pick(o, ['주상병명'])), days: num(pick(o, ['내원일수', '진료일수'])), car: !!pick(o, ['자동차보험']), pay: num(pick(o, ['내가낸의료비', '본인부담'])), total: num(pick(o, ['총진료비'])) };
    }).filter(function (r) { return r.date; });
  }
  function buildDetail(rows) {
    return rowsToRecords(rows).map(function (o) {
      return { date: fmt(pd(pick(o, ['진료시작일'])) || new Date(0)), hosp: pick(o, ['병·의원']).replace(/\s+/g, ''), cat: pick(o, ['진료내역']), item: pick(o, ['코드명']), days: num(pick(o, ['총투약일수'])) };
    });
  }
  function buildRx(rows) {
    return rowsToRecords(rows).map(function (o) {
      return { date: fmt(pd(pick(o, ['진료시작일'])) || new Date(0)), hosp: pick(o, ['병·의원']).replace(/\s+/g, ''), kind: pick(o, ['처방/조제', '처방']), drug: pick(o, ['약품명']), ingr: pick(o, ['성분명']), dose: num(pick(o, ['1회투약량'])), times: num(pick(o, ['1일투여횟수'])), days: num(pick(o, ['총투약일수'])) };
    });
  }
  // 요양급여내역서: 압축 행 패턴 파싱
  function buildRecent(rows) {
    var recs = [], period = '', cur = null;
    rows.forEach(function (r) {
      var c = r.filter(function (x) { return x; });
      c.forEach(function (x, i) { if (x === '발급기간' && c[i + 1]) period = c[i + 1]; });
      if (c.length >= 3 && /^\d{4}\.\d{2}\.\d{2}$/.test(c[0])) {
        cur = { date: fmt(pd(c[0])), inDays: num(c[1]), hosp: (c[2] || '').replace(/\s+/g, ''), hospDisp: c[2] || '', type: '', rxDays: 0, name: '', code: '' };
        recs.push(cur); return;
      }
      if (cur && !cur.type) {
        var j = 0; if (/^\d+$/.test(c[0]) && /^(외래|입원|약국)/.test(c[1] || '')) j = 1;
        if (/^(외래|입원|약국)/.test(c[j] || '')) {
          cur.type = c[j]; cur.rxDays = num(c[j + 1]);
          var rest = c.slice(j + 2);
          var ci = rest.findIndex(function (x) { return /^[A-Z]\d{2,}[0-9A-Z]*$/.test(x); });
          if (ci >= 0) { cur.code = normCode(rest[ci]).code; cur.name = rest.slice(0, ci).join(''); }
          var money = rest.slice(ci >= 0 ? ci + 1 : 0).filter(function (x) { return /^[\d,]+$/.test(x); });
          if (money.length) cur.pay = num(money[0]);
        }
      }
    });
    return { rows: recs, period: period };
  }

  // 내가 먹는 약 한눈에(투약이력) 엑셀: 행 배열 -> 처방 레코드 (처방기관 기준)
  function buildTuyak(rows) {
    var hi = -1, H = null;
    for (var i = 0; i < rows.length; i++) { var r = (rows[i] || []).map(function (x) { return String(x == null ? '' : x).replace(/\s/g, ''); }); if (r.indexOf('조제일자') >= 0 && r.indexOf('제품명') >= 0) { hi = i; H = r; break; } }
    if (hi < 0) return [];
    var col = function (n) { return H.indexOf(n); };
    var cD = col('조제일자'), cH = col('처방기관'), cP = col('조제기관'), cN = col('제품명'), cI = col('성분명'), cC = col('약효분류'), cDo = col('1회투약량'), cT = col('1일투여횟수'), cDy = col('총투약일수');
    var out = [];
    rows.slice(hi + 1).forEach(function (r) {
      if (!r) return; var d = pd(String(r[cD] || ''));
      if (!d) return;
      var hosp = String(r[cH] || r[cP] || '').replace(/\s+/g, '');
      out.push({ date: fmt(d), hosp: hosp, pharm: String(r[cP] || '').replace(/\s+/g, ''), kind: '투약이력', drug: String(r[cN] || ''), ingr: String(r[cI] || ''), cls: String(r[cC] || ''), dose: num(r[cDo]), times: num(r[cT]), days: num(r[cDy]), src: '투약이력' });
    });
    return out;
  }
  // 처방 자료 합치기 (같은 병원·날짜·성분은 하나로)
  function mergeRx(a, b) {
    var key = function (x) { return x.hosp + '|' + x.date + '|' + (String(x.ingr || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || String(x.drug).slice(0, 6)); };
    var seen = {}; a.forEach(function (x) { seen[key(x)] = 1; });
    return a.concat(b.filter(function (x) { if (seen[key(x)]) return false; seen[key(x)] = 1; return true; }));
  }

  // ---------- 판정 ----------
  function analyze(input, opt) {
    var base = pd(opt.baseDate) || new Date();
    var d5 = addM(base, -60), d3m = addM(base, -3);
    var mode = opt.mode; // 'std' | 'simple'
    var N = opt.N == null ? 5 : opt.N, M = opt.M == null ? 5 : opt.M;
    var dN = addM(base, -12 * N), dM = addM(base, -12 * M);
    var majorFn = mode === 'std' ? std11 : simple6;
    var majorLabel = mode === 'std' ? '11대질병' : '중대질병';

    var basic = input.basic || [], detail = input.detail || [], rx = input.rx || [], recent = (input.recent && input.recent.rows) || [];
    var inWin = function (r) { var d = pd(r.date); return d && d >= d5 && d <= base; };

    var hospRows = basic.filter(function (r) { return !isPharm(r.hosp, r.dept) && inWin(r); });
    // 요양급여내역서(공단) 병원 진료 중 심평원 자료에 없는 것 추가
    var basicKeys = {}; basic.forEach(function (r) { basicKeys[r.hosp + '|' + r.date] = 1; });
    recent.forEach(function (r) {
      if (/약국/.test(r.type) || !r.code || basicKeys[r.hosp + '|' + r.date] || !inWin(r)) return;
      hospRows.push({ date: r.date, hosp: r.hosp, hospDisp: r.hospDisp, dept: '', type: r.type, code: r.code, src: '', name: r.name, days: r.inDays || 1, fromRecent: true });
    });
    var pharmRows = basic.filter(function (r) { return isPharm(r.hosp, r.dept) && inWin(r); });

    // 병원 방문 단위 (병원+날짜)
    var visitKey = function (h, d) { return h + '|' + d; };
    var visits = {};
    hospRows.forEach(function (r) {
      var k = visitKey(r.hosp, r.date);
      if (!visits[k]) visits[k] = { hosp: r.hosp, hospDisp: r.hospDisp, dept: r.dept, date: r.date, rows: [] };
      visits[k].rows.push(r);
    });
    // 병원 처방 (외래/입원 처방 행)
    var rxByVisit = {}, rxPharm = {};
    rx.forEach(function (x) {
      var k = visitKey(x.hosp, x.date);
      if (visits[k]) (rxByVisit[k] = rxByVisit[k] || []).push(x);
      else (rxPharm[k] = rxPharm[k] || []).push(x);
    });
    var drugKey = function (s) { return String(s || '').replace(/\(.*$/, '').replace(/[_\s].*$/, '').replace(/\d.*$/, ''); };
    var ingrKey = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12); };

    // 약국 행 -> 병원 방문 연결 (같은 날짜, 약 성분 일치 > 코드 일치 > 단일 병원)
    var pharmLinks = []; // {visitKey, pharm row, drugs}
    pharmRows.forEach(function (p) {
      var cands = Object.keys(visits).filter(function (k) { return visits[k].date === p.date; });
      var pdrugs = rxPharm[visitKey(p.hosp, p.date)] || [];
      var best = null, bestScore = -1;
      cands.forEach(function (k) {
        var hd = rxByVisit[k] || [], score = 0;
        pdrugs.forEach(function (a) { if (hd.some(function (b) { return ingrKey(a.ingr) && ingrKey(a.ingr) === ingrKey(b.ingr); })) score += 10; });
        if (visits[k].rows.some(function (r) { return r.code === p.code; })) score += 3;
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (best) pharmLinks.push({ vk: best, p: p, drugs: pdrugs });
    });

    // 카드: 상병코드 단위
    var cards = {};
    function card(code, name, src) {
      if (!cards[code]) cards[code] = { code: code, name: name, src: src, visits: [], hosps: {}, pharmCodes: {}, surg: [], proc: [], exams: [], details: {}, meds: [], inpDays: 0, outDays: 0, disc: [], first: null, last: null };
      return cards[code];
    }
    // 방문별 주상병: 입원 행 > 내원일수 큰 행 > 자료 순서. 주상병이 된 적 없이 다른 상병과 함께만 나온 상병은 그 주상병 카드에 묶음
    function primaryOf(v) {
      var coded = v.rows.filter(function (r) { return r.code; });
      if (!coded.length) return null;
      var pool = coded.filter(function (r) { return /입원/.test(r.type); });
      if (!pool.length) pool = coded;
      return pool.reduce(function (b, r) { return (r.days || 0) > (b.days || 0) ? r : b; }, pool[0]);
    }
    var asPrimary = {};
    Object.keys(visits).forEach(function (k) { var p = primaryOf(visits[k]); if (p) asPrimary[p.code] = 1; });
    Object.keys(visits).forEach(function (k) {
      var v = visits[k];
      var mainRow = primaryOf(v);
      if (!mainRow) return;
      var codesSeen = {};
      v.rows.forEach(function (r) {
        if (!r.code || codesSeen[r.code]) return; codesSeen[r.code] = 1;
        var absorbed = !asPrimary[r.code] && r.code !== mainRow.code;
        var c = absorbed ? card(mainRow.code, mainRow.name, mainRow.src) : card(r.code, r.name, r.src);
        if (absorbed) { c.siblings = c.siblings || {}; c.siblings[r.code] = r.name; if (codesSeen['@' + mainRow.code]) return; }
        codesSeen['@' + c.code] = 1;
        var isIn = v.rows.some(function (x) { return (x.code === r.code || x.code === c.code) && /입원/.test(x.type); });
        c.visits.push({ hosp: v.hosp, hospDisp: v.hospDisp, dept: v.dept, date: v.date, inp: isIn, days: 1 });
        var h = c.hosps[v.hosp] = c.hosps[v.hosp] || { name: v.hospDisp || v.hosp, dept: {}, dates: {}, inp: 0, out: 0, first: v.date, last: v.date };
        h.dept[v.dept] = 1;
        var dd = isIn ? Math.max(1, Math.max.apply(null, v.rows.filter(function (x) { return x.code === r.code || x.code === c.code; }).map(function (x) { return x.days || 0; }))) : 1;
        if (!h.dates[v.date]) { h.dates[v.date] = 1; if (isIn) h.inp += dd; else h.out += 1; }
        if (v.date < h.first) h.first = v.date; if (v.date > h.last) h.last = v.date;
      });
      var c = cards[mainRow.code];
      // 세부진료 (같은 병원+날짜)
      detail.forEach(function (d) {
        if (d.hosp !== v.hosp || d.date !== v.date) return;
        (c.details[v.date + ' ' + (v.hospDisp || v.hosp)] = c.details[v.date + ' ' + (v.hospDisp || v.hosp)] || []).push(d.item);
        if (SURG_RE.test(d.item) && !SURG_EX.test(d.item) && (/처치|수술|수혈|마취/.test(d.cat) || /생검|광응고|쇄석|절석|임플란트|조갑/.test(d.item))) c.surg.push({ date: v.date, hosp: v.hospDisp || v.hosp, item: d.item });
        else if (PROC_RE.test(d.item) && !PROC_EX.test(d.item)) c.proc.push({ date: v.date, hosp: v.hospDisp || v.hosp, item: d.item });
        if (d.item && (EXAM_RE.test(d.item) || /영상진단|방사선|특수장비|핵의학/.test(d.cat)) && !EXAM_EX.test(d.item) && !/PACS|영상저장/.test(d.item)) c.exams.push({ date: v.date, hosp: v.hospDisp || v.hosp, item: d.item });
      });
      // 투약
      var drugs = (rxByVisit[k] || []).slice();
      pharmLinks.filter(function (l) { return l.vk === k; }).forEach(function (l) {
        l.drugs.forEach(function (a) { if (!drugs.some(function (b) { return ingrKey(a.ingr) === ingrKey(b.ingr) && ingrKey(a.ingr); })) drugs.push(a); });
        if (l.p.code && l.p.code !== mainRow.code && !v.rows.some(function (r) { return r.code === l.p.code; })) {
          var pc = c.pharmCodes[l.p.code] = c.pharmCodes[l.p.code] || { code: l.p.code, name: l.p.name, pharm: l.p.hosp, dates: [] };
          pc.dates.push(v.date);
        }
      });
      if (drugs.length) c.meds.push({ date: v.date, hosp: v.hospDisp || v.hosp, drugs: drugs.map(function (x) { return { name: x.drug, days: x.days }; }) });
    });

    // 카드 집계
    var list = Object.keys(cards).map(function (k) { return cards[k]; });
    // 날짜 기준 처방 묶음 (병원 외래 + 약국 조제 모두)
    var rxByDate = {};
    rx.forEach(function (x) { (rxByDate[x.date] = rxByDate[x.date] || []).push(x); });
    list.forEach(function (c) {
      c.visits.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      c.first = c.visits[0].date; c.last = c.visits[c.visits.length - 1].date;
      Object.keys(c.hosps).forEach(function (h) { c.inpDays += c.hosps[h].inp; c.outDays += c.hosps[h].out; });
      // 그 상병 방문(병원+날짜)에 연결된 처방과, 그 방문에 연결된 약국 조제만 집계 (같은 날 다른 병원 처방은 제외)
      var maxMed = 0, cumByDrug = {};
      c.meds.forEach(function (m) {
        var perDrug = {};
        m.drugs.forEach(function (x) { if ((x.days || 0) > (perDrug[x.name] || 0)) perDrug[x.name] = x.days || 0; });
        m.drugs = Object.keys(perDrug).map(function (n) { return { name: n, days: perDrug[n] }; });
        m.drugs.forEach(function (x) { if (x.days > maxMed) maxMed = x.days; cumByDrug[x.name] = (cumByDrug[x.name] || 0) + x.days; });
      });
      c.maxMed = maxMed;
      c.medTotals = Object.keys(cumByDrug).map(function (n) { return { name: n, days: cumByDrug[n] }; }).sort(function (a, b) { return b.days - a.days; });
      c.rxDays = c.medTotals.length ? c.medTotals[0].days : 0; // 대표 약물 누적일수
    });
    // 동일원인 합산 (3자리 코드)
    var groups = {};
    list.forEach(function (c) { (groups[c3(c.code)] = groups[c3(c.code)] || []).push(c); });
    list.forEach(function (c) {
      var g = groups[c3(c.code)];
      c.group = g.length > 1 ? { key: c3(c.code), total: g.reduce(function (s, x) { return s + x.outDays + x.inpDays; }, 0), rx: g.reduce(function (s, x) { return s + x.rxDays; }, 0), members: g } : null;
    });

    // 같은 병원 연속 치료(30일 이내 간격) 묶음: 상병코드가 달라도 같은 질환일 수 있어 확인용
    var hospEp = {};
    (function () {
      var byH = {};
      Object.keys(visits).forEach(function (k) { var v = visits[k]; (byH[v.hosp] = byH[v.hosp] || {})[v.date] = 1; });
      Object.keys(byH).forEach(function (h) {
        var ds = Object.keys(byH[h]).sort(), ep = [], eps = [];
        ds.forEach(function (d, i) { if (i && (pd(d) - pd(ds[i - 1])) / 864e5 > 30) { eps.push(ep); ep = []; } ep.push(d); });
        if (ep.length) eps.push(ep);
        eps.forEach(function (e) { e.forEach(function (d) { hospEp[h + '|' + d] = e; }); });
      });
    })();
    var d1y = addM(base, -12);

    // 고지 판정: lv 'y' = 고지 대상, 'c' = 확인 필요
    list.forEach(function (c) {
      var D = [];
      var add = function (lv, k, t, q) { D.push({ lv: lv, k: k, t: t, q: q || '' }); };
      var winY = mode === 'std' ? d5 : dN;
      var inpN = c.visits.filter(function (v) { return v.inp && pd(v.date) >= winY; });
      var surgN = c.surg.filter(function (s) { return pd(s.date) >= winY; });
      var procN = c.proc.filter(function (s) { return pd(s.date) >= winY; });
      var hs = Object.keys(c.hosps).map(function (h) { return c.hosps[h].name; }).join(', ');
      var major = majorFn(c.code), sus = majorSuspect(c.code) || (mode === 'simple' && std11(c.code) && !major ? std11(c.code) : '');
      var tot = c.group ? c.group.total : c.outDays + c.inpDays;
      var sumVisitMax = c.meds.reduce(function (s, m) { return s + Math.max.apply(null, m.drugs.map(function (d) { return d.days || 0; }).concat([0])); }, 0);
      var ex1y = c.exams.filter(function (e) { return pd(e.date) >= d1y; });
      var ex3m = c.exams.filter(function (e) { return pd(e.date) >= d3m; });
      var maxEp = 0, epH = '';
      c.visits.forEach(function (v) { var e = hospEp[v.hosp + '|' + v.date]; if (e && e.length > maxEp) { maxEp = e.length; epH = v.hospDisp || v.hosp; } });
      var procNames = function (arr) { var u = {}; arr.forEach(function (p) { u[p.item.replace(/[\[(].*$/, '')] = 1; }); return Object.keys(u).slice(0, 3).join(', '); };

      if (mode === 'std') {
        if (inpN.length) add('y', '입원', '입원(5년 이내)');
        if (surgN.length) add('y', '수술', '수술(5년 이내)');
        if (!surgN.length && !procN.length && /^S[0-9]1|^T1[4-9]/.test(c.code.replace('.', '')) && pd(c.last) >= winY) add('c', '시술', '상처·이물 진료 — 봉합·제거 등 처치(수술) 여부 확인', hs + ' 진료 때 상처 봉합이나 이물 제거 같은 처치를 받으셨나요?');
        if (!surgN.length && procN.length) add('c', '시술', '시술 — 수술 해당 여부 확인 (' + procNames(procN) + ')', hs + '에서 ' + procNames(procN) + ' 받으신 적이 있는데, 병원에서 수술로 안내받으셨나요?');
        if (tot >= 7) add('y', '7일이상', '7일이상 치료(5년 이내)' + (c.group && c.outDays + c.inpDays < 7 ? ' · 동일원인 합산' : ''));
        else if (maxEp >= 7) add('c', '7일이상', '7일이상 치료 가능성 — ' + epH + ' 연속 치료 ' + maxEp + '일 (같은 질환인지 확인)', epH + '에서 비슷한 시기에 ' + maxEp + '일 치료받으셨는데, 같은 질환으로 계속 치료받으신 건가요?');
        if (c.rxDays >= 30) add('y', '30일이상', '30일이상 투약(5년 이내)');
        else if (sumVisitMax >= 20) add('c', '30일이상', '30일이상 투약 가능성 — 처방 합계 ' + sumVisitMax + '일 (같은 약 계속 복용·추가 처방 여부 확인)', c.name + ' 관련 약을 합계 ' + sumVisitMax + '일 처방받으셨는데, 같은 약을 계속 드신 건가요?');
        if (major) add('y', '질병', '11대질병(' + major + ')');
        else if (sus) add('c', '질병', '중대질병 관련 확인 — ' + sus, c.name + ' 진단 이후 확진이나 추적검사, 치료를 받으신 적이 있나요?');
        var hasY = D.some(function (d) { return d.lv === 'y'; });
        if (ex1y.length) add(hasY ? 'y' : 'c', '정밀', '1년 이내 정밀검사 — 추가검사·재검사 소견 확인 (' + uniqStr(ex1y.map(function (e) { return e.item.replace(/[\[(].*$/, ''); })).slice(0, 2).join(', ') + ')', (ex1y[ex1y.length - 1].hosp) + '(' + ex1y[ex1y.length - 1].date.slice(2) + ')에서 받으신 ' + uniqStr(ex1y.map(function (e) { return e.item.replace(/[\[(].*$/, ''); }))[0] + ' 결과로 재검사나 추가검사 소견을 들으셨나요?');
      } else {
        if (N > 0 && inpN.length) add('y', '입원', '입원(' + N + '년 이내)');
        if (N > 0 && surgN.length) add('y', '수술', '수술(' + N + '년 이내)');
        if (N > 0 && !surgN.length && !procN.length && /^S[0-9]1|^T1[4-9]/.test(c.code.replace('.', '')) && pd(c.last) >= winY) add('c', '시술', '상처·이물 진료 — 봉합·제거 등 처치(수술) 여부 확인', hs + ' 진료 때 상처 봉합이나 이물 제거 같은 처치를 받으셨나요?');
        if (N > 0 && !surgN.length && procN.length) add('c', '시술', '시술 — 수술 해당 여부 확인 (' + procNames(procN) + ')', hs + '에서 ' + procNames(procN) + ' 받으신 적이 있는데, 병원에서 수술로 안내받으셨나요?');
        if (major && pd(c.last) >= dM) add('y', '질병', '중대질병(' + major + ', ' + M + '년 이내)');
        else if (sus && pd(c.last) >= dM) add('c', '질병', '중대질병 관련 확인 — ' + sus, c.name + ' 진단 이후 확진이나 추적검사, 치료를 받으신 적이 있나요?');
        if (ex3m.length) add('c', '정밀', '3개월 이내 검사 — 추가검사·재검사 소견 확인', ex3m[ex3m.length - 1].hosp + '(' + ex3m[ex3m.length - 1].date.slice(2) + ')에서 최근 받으신 검사 결과로 재검사나 추가검사 소견을 들으셨나요?');
        var ch = chronicHD(c.code);
        if (ch && opt.chronic) add('c', '만성', ch + ' — 상품의 고혈압·당뇨 고지 기준 확인 (진단·투약 이력)', '');
      }
      // 약국 조제 상병
      Object.keys(c.pharmCodes).forEach(function (pc) {
        var m = std11(pc) || majorSuspect(pc);
        if (m) D.unshift({ lv: 'c', k: '질병', pharm: true, t: '약국 조제 상병 ' + pc + ' ' + c.pharmCodes[pc].name + ' — 고지 가능성 있음 (병원 진단명 확인)', q: c.pharmCodes[pc].pharm + '에서 ' + c.pharmCodes[pc].name + '(으)로 조제된 기록이 있는데, 이 병으로 진단받으신 적이 있나요?' });
      });
      c.disc = D;
      c.tier = D.some(function (d) { return d.lv === 'y'; }) ? 'disc' : D.length ? 'check' : 'none';
      // 간편: N년 경과로 빠진 입원/수술 안내
      c.expired = [];
      if (mode === 'simple') {
        if (c.visits.some(function (v) { return v.inp; }) && !D.some(function (d) { return d.k === '입원'; })) c.expired.push('입원 ' + (N > 0 ? N + '년 경과' : '질문 없음'));
        if (c.surg.length && !D.some(function (d) { return d.k === '수술'; })) c.expired.push('수술 ' + (N > 0 ? N + '년 경과' : '질문 없음'));
      }
      // 미해당 사유
      if (c.tier === 'none') {
        var rs = [];
        if (mode === 'std') {
          rs.push('치료 ' + tot + '일(7일 미만)');
          rs.push(c.rxDays ? '투약 누적 ' + c.rxDays + '일(30일 미만)' : '투약 없음');
          rs.push(c.visits.some(function (v) { return v.inp; }) ? '입원 5년 경과' : '입원 없음');
          rs.push(c.surg.length || c.proc.length ? '수술·시술 5년 경과' : '수술 없음');
        } else {
          rs.push(c.visits.some(function (v) { return v.inp; }) ? '입원 ' + N + '년 경과' : '입원 없음');
          rs.push(c.surg.length ? '수술 ' + N + '년 경과' : '수술 없음');
          rs.push('중대질병 아님');
        }
        c.reason = rs.join(' · ');
      }
    });
    function uniqStr(a) { var u = {}; return a.filter(function (x) { if (u[x]) return false; u[x] = 1; return true; }); }

    var byLast = function (a, b) { return b.last < a.last ? -1 : 1; };
    var main = list.filter(function (c) { return c.tier === 'disc'; }).sort(byLast);
    var check = list.filter(function (c) { return c.tier === 'check'; }).sort(byLast);
    var extra = list.filter(function (c) { return c.tier === 'none'; }).sort(byLast);

    // 3개월 이내
    var knownCodes = {}; list.forEach(function (c) { if (pd(c.first) < d3m) knownCodes[c.code] = 1; });
    var r3 = [];
    var seen = {};
    recent.forEach(function (r) {
      var d = pd(r.date); if (!d || d < d3m || d > base) return;
      seen[r.hosp + '|' + r.date] = 1;
      r3.push({ date: r.date, hosp: r.hospDisp || r.hosp, type: r.type, days: r.inDays, rxDays: r.rxDays, code: r.code, name: r.name, src: '요양급여내역서' });
    });
    basic.forEach(function (r) {
      var d = pd(r.date); if (!d || d < d3m || d > base || seen[r.hosp + '|' + r.date]) return;
      r3.push({ date: r.date, hosp: r.hospDisp || r.hosp, type: isPharm(r.hosp, r.dept) ? '약국' : r.type, days: r.days, rxDays: 0, code: r.code, name: r.name, src: '심평원 기본진료' });
    });
    // 처방조제 자료에만 있는 최근 병원 방문(심평원 기본·공단 자료에 아직 없는 것): 같은 병원의 이전 상병으로 추정
    basic.forEach(function (r) { seen[r.hosp + '|' + r.date] = 1; });
    rx.forEach(function (x) {
      var d = pd(x.date); if (!d || d < d3m || d > base || seen[x.hosp + '|' + x.date] || isPharm(x.hosp, '')) return;
      seen[x.hosp + '|' + x.date] = 1;
      var prev = basic.filter(function (b) { return b.hosp === x.hosp && b.code && b.date < x.date; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
      r3.push({ date: x.date, hosp: x.hosp, type: '외래', days: 1, rxDays: x.days, code: prev ? prev.code : '', name: prev ? prev.name + ' (같은 병원 이전 진단으로 추정)' : '', src: x.src === '투약이력' ? '내가 먹는 약(투약이력)' : '심평원 처방조제', guessed: true });
    });
    r3.forEach(function (x) {
      var pharm = /약국/.test(x.type);
      if (mode === 'std') x.judge = '3개월 이내 진단·치료' + (pharm || x.rxDays ? '·투약' : '');
      else if (pharm) x.judge = '투약 — 기존 처방과 약 종류·용량 비교 필요 (신규·증량이면 고지)';
      else if (x.code && knownCodes[x.code]) x.judge = '기왕증 통원 (처방 유지·감소면 유지 고지)';
      else x.judge = '신규 진료 — 진단명·추가검사 소견 확인 필요';
      x.major = majorFn(x.code);
    });
    r3.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    // 3개월 이내: 상병(없으면 병원) 단위 카드로 묶기
    var ik3 = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12); };
    var hospDates = {}; r3.forEach(function (x) { if (!/약국/.test(x.type)) (hospDates[x.date] = hospDates[x.date] || []).push(x); });
    var g3 = {};
    r3.forEach(function (x) {
      var pharm = /약국/.test(x.type);
      var target = x;
      if (pharm) { var hs = hospDates[x.date] || []; target = hs.filter(function (h) { return !x.code || h.code === x.code; })[0] || hs[0] || x; }
      if (pharm && target === x && !x.code) {
        // 약국만 있는 최근 조제: 같은 성분을 예전에 처방받은 상병으로 추정
        var ings = rx.filter(function (q) { return q.date === x.date && (q.hosp === (x.hospKey || x.hosp) || q.hosp === String(x.hosp).replace(/\s+/g, '')); }).map(function (q) { return ik3(q.ingr) || q.drug; });
        var bestC = null, bestN = 0, bestD = '';
        list.forEach(function (c) { c.meds.forEach(function (m) { if (pd(m.date) >= d3m) return; var n = 0; m.drugs.forEach(function (dd) { var rr = rx.filter(function (q) { return q.drug === dd.name; })[0]; if (rr && ings.indexOf(ik3(rr.ingr) || rr.drug) >= 0) n++; }); if (n > bestN || (n === bestN && n > 0 && m.date > bestD)) { bestN = n; bestC = c; bestD = m.date; } }); });
        if (bestC) target = { code: bestC.code, name: bestC.name + ' (같은 약 처방 이력으로 추정)', hosp: x.hosp, date: x.date };
      }
      var key = target.code ? target.code : '?' + (target.hosp || x.hosp);
      var g = g3[key] = g3[key] || { code: target.code || '', name: target.code ? target.name : '', hosps: {}, dates: {}, rx: false, src: {}, first: x.date, last: x.date };
      if (!pharm || target === x) { g.hosps[target.hosp] = 1; g.dates[target.date] = 1; }
      if (pharm || x.rxDays > 1) g.rx = true;
      g.src[x.src] = 1;
      if (x.date < g.first) g.first = x.date; if (x.date > g.last) g.last = x.date;
    });
    // 기존 투약(3개월 전) 성분/용량과 비교
    var before = {}, inWin3 = {};
    list.forEach(function (c) { c.meds.forEach(function (m) { var tgt = pd(m.date) < d3m ? before : inWin3; m.drugs.forEach(function (d) { var k = c.code + '|' + d.name; tgt[k] = Math.max(tgt[k] || 0, 1); }); }); });
    var rxIn = rx.filter(function (x) { var d = pd(x.date); return d && d >= d3m && d <= base; });
    var rxBefore = rx.filter(function (x) { var d = pd(x.date); return d && d < d3m && d >= d5; });
    var cards3 = Object.keys(g3).map(function (k) {
      var g = g3[k];
      var dates = Object.keys(g.dates);
      var hs = Object.keys(g.hosps);
      var winDrugs = rxIn.filter(function (x) { return dates.indexOf(x.date) >= 0; });
      if (winDrugs.length) g.rx = true;
      var newDrug = null;
      if (g.code && knownCodes[g.code]) {
        var prevHosp = {}; basic.forEach(function (b) { if (b.code === g.code && pd(b.date) < d3m) prevHosp[b.hosp + '|' + b.date] = 1; });
        var prev = {}; rxBefore.forEach(function (x) { if (prevHosp[x.hosp + '|' + x.date] || Object.keys(prevHosp).some(function (pk) { return pk.split('|')[1] === x.date; })) { var q = (x.dose || 1) * (x.times || 1); prev[ik3(x.ingr) || x.drug] = Math.max(prev[ik3(x.ingr) || x.drug] || 0, q); } });
        winDrugs.forEach(function (x) { var key = ik3(x.ingr) || x.drug; var q = (x.dose || 1) * (x.times || 1); if (!(key in prev) || q > prev[key]) { if (!newDrug || x.date < newDrug.date) newDrug = x; } });
      }
      var judge;
      if (mode === 'std') judge = '3개월 이내 진단·치료' + (g.rx ? '·투약' : '');
      else if (!g.code) judge = '진단명 확인 필요 — 병원·처방일자로 고객에게 확인';
      else if (knownCodes[g.code] && !newDrug) judge = '3개월 이내 기왕증 단순 통원 처방(처방약품 유지/감소·진료 유지 고지)';
      else if (knownCodes[g.code]) judge = '3개월 이내 투약 신규 또는 증가(' + newDrug.date.slice(5).replace('-', '/') + ' 발생)';
      else judge = '3개월 이내 신규 진료' + (g.rx ? '·투약' : '') + ' — 진단명·추가검사 소견 확인';
      return { code: g.code, name: g.name, hosps: hs, days: dates.length, first: g.first, last: g.last, rx: g.rx, judge: judge, major: majorFn(g.code), src: Object.keys(g.src).join(', ') };
    }).sort(function (a, b) { return a.last < b.last ? 1 : -1; });

    var counts = { 입원: 0, 수술: 0, '7일이상': 0, '30일이상': 0, 질병: 0, 정밀: 0, 시술: 0, 만성: 0 };
    main.forEach(function (c) { var s = {}; c.disc.forEach(function (d) { if (d.lv === 'y' && !s[d.k]) { counts[d.k]++; s[d.k] = 1; } }); });

    // 고객 확인 질문
    var questions = [];
    cards3.forEach(function (x) {
      var where = (x.hosps.join(', ') || '병원') + '(' + x.first.slice(5).replace('-', '/') + (x.first !== x.last ? '~' + x.last.slice(5).replace('-', '/') : '') + ')';
      if (!x.code) questions.push({ sec: '3개월', q: where + ' 조제약은 어떤 질환으로 처방받으셨나요? 입원·수술·추가검사 권유가 있었나요?' });
      else questions.push({ sec: '3개월', q: where + ' ' + x.name.replace(/ \(.*\)$/, '') + ' 진료 때 추가검사·재검사나 입원·수술 권유를 받으셨나요?' + (mode === 'simple' ? ' 약이 새로 추가되거나 용량이 늘었나요?' : '') });
    });
    main.concat(check).forEach(function (c) { c.disc.forEach(function (d) { if (d.lv === 'c' && d.q) questions.push({ sec: '확인 필요', code: c.code, q: d.q }); }); });
    questions.push({ sec: '공통', q: '심평원 자료에 나오지 않는 비급여 치료(도수치료, 비급여 주사, 한방 비급여 등)를 받으신 적이 있나요?' });
    questions.push({ sec: '공통', q: '현재 복용 중인 약이 있나요? 최근 약이 바뀌거나 용량이 늘었나요?' });
    questions.push({ sec: '공통', q: '건강검진에서 재검사·추가검사(정밀검사) 소견을 받은 적이 있나요?' });
    if (mode === 'simple' && N > 5) questions.push({ sec: '공통', q: N + '년 이내 입원·수술 질문: 심평원 자료는 5년치만 나옵니다. 5년보다 전(' + fmt(dN).slice(0, 4) + '년 이후)에 입원하거나 수술받으신 적이 있나요?' });


    return {
      base: fmt(base), from5: fmt(d5), from3m: fmt(d3m), mode: mode, N: N, M: M,
      label: mode === 'std' ? '표준체 5년 고지 (일반심사)' : '유병자 간편심사 3.' + N + '.' + M,
      majorLabel: majorLabel, main: main, check: check, extra: extra, questions: questions, recent3m: r3, recent3mCards: cards3, counts: counts,
      dataRange: basic.length ? { from: basic.reduce(function (m, r) { return r.date < m ? r.date : m; }, '9999'), to: basic.reduce(function (m, r) { return r.date > m ? r.date : m; }, '0000') } : null,
      recentPeriod: input.recent ? input.recent.period : ''
    };
  }

  // 세부진료 항목 분류: 'surg' | 'proc' | '' , exam 여부
  function classifyDetail(d) {
    var out = { surg: false, proc: false, exam: false };
    if (SURG_RE.test(d.item) && !SURG_EX.test(d.item) && (/처치|수술|수혈|마취/.test(d.cat) || /생검|광응고|쇄석|절석|임플란트|조갑/.test(d.item))) out.surg = true;
    else if (PROC_RE.test(d.item) && !PROC_EX.test(d.item)) out.proc = true;
    if (d.item && (EXAM_RE.test(d.item) || /영상진단|방사선|특수장비|핵의학/.test(d.cat)) && !EXAM_EX.test(d.item) && !/PACS|영상저장/.test(d.item)) out.exam = true;
    return out;
  }
  var api = { analyze: analyze, classifyDetail: classifyDetail, majorSuspect: majorSuspect, chronicHD: chronicHD, addM: addM, pd: pd, fmt: fmt, buildTuyak: buildTuyak, mergeRx: mergeRx, buildBasic: buildBasic, buildDetail: buildDetail, buildRx: buildRx, buildRecent: buildRecent, normCode: normCode, std11: std11, simple6: simple6, isPharm: isPharm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Analyzer = api;
})(this);

