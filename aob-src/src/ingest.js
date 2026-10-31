// 파일 읽기: PDF(심평원·공단·검진) / 투약이력 엑셀 → 분석 입력 (브라우저/Node 공용)
(function (root) {
  function sniff(u) {
    if (u.length > 8 && u[0] === 0xD0 && u[1] === 0xCF && u[2] === 0x11 && u[3] === 0xE0) return 'sheet';
    if (u.length > 4 && u[0] === 0x50 && u[1] === 0x4B && (u[2] === 3 || u[2] === 5 || u[2] === 7)) { var hd = new TextDecoder('latin1').decode(u.subarray(0, Math.min(u.length, 4000))); return /\[Content_Types\]\.xml|xl\//.test(hd) ? 'sheet' : 'zip'; }
    for (var i = 0; i < Math.min(u.length - 4, 1024); i++) if (u[i] === 0x25 && u[i + 1] === 0x50 && u[i + 2] === 0x44 && u[i + 3] === 0x46) return 'pdf';
    return '';
  }
  function pwList(birth) {
    var b = String(birth || '').replace(/\D/g, '');
    var out = [];
    if (b.length === 8) out.push(b, b.slice(2));
    else if (b.length === 6) { out.push(b); var yy2 = +b.slice(0, 2); out.push((yy2 > 30 ? '19' : '20') + b, (yy2 > 30 ? '20' : '19') + b); }
    else if (b) out.push(b);
    return out;
  }
  var KIND_LABEL = { basic: '기본진료', detail: '세부진료', rx: '처방조제', summary: '진료요약', recent: '요양급여내역서', checkup: '검진결과통보서', checkupAll: '검진 한눈에', coverage: '보장분석', unknown: '인식 불가' };

  async function readPdf(L, data, pws) {
    var doc = await L.PdfTable.openPdf(L.pdfjsLib, data, pws);
    var p1 = await doc.getPage(1);
    var first = (await L.PdfTable.pageText(p1)).join(' ');
    // 보장분석 PDF (메리츠 M보장분석 / KB 보장분석): 글자만 읽어 계약·특약 목록으로
    if (L.Coverage && /보장분석|님의\s*건강을\s*위한|보험가입현황/.test(first) && !/주상병코드|요양급여내역|결과통보서/.test(first)) {
      var pages = [(await L.PdfTable.pageText(p1))];
      for (var q = 2; q <= doc.numPages; q++) pages.push(await L.PdfTable.pageText(await doc.getPage(q)));
      var cv = L.Coverage.parse(pages);
      if (cv && cv.contracts.length) return { kind: 'coverage', cov: cv, rows: [], text: '' };
    }
    var t1 = await L.PdfTable.pageTable(L.pdfjsLib, p1);
    var hdr = (t1.rows.find(function (r) { return r[0] === '순번'; }) || []).join('|').replace(/\s/g, '');
    var kind = /주상병코드/.test(hdr) ? 'basic' : /코드명/.test(hdr) ? 'detail' : /약품명/.test(hdr) ? 'rx' : /입원\(외래\)일수/.test(hdr) ? 'summary' : /요양급여내역/.test(first) ? 'recent' : /결과통보서/.test(first) ? 'checkup' : /한번에\s*보기/.test(first) ? 'checkupAll' : 'unknown';
    var rows = t1.rows.slice(), text = [first];
    for (var i = 2; i <= doc.numPages; i++) {
      var pg = await doc.getPage(i);
      rows = rows.concat((await L.PdfTable.pageTable(L.pdfjsLib, pg)).rows);
      if (kind === 'checkup') text.push((await L.PdfTable.pageText(pg)).join('\n'));
    }
    if (kind === 'checkup') text = [(await L.PdfTable.pageText(p1)).join('\n')].concat(text.slice(1));
    return { kind: kind, rows: rows, text: text.join('\n') };
  }
  function parseCheckupAll(rows) {
    var yr = rows.find(function (r) { return r.some(function (c) { return c === '검진년도'; }); });
    var dt = rows.find(function (r) { return r.some(function (c) { return c === '검진일자'; }); });
    if (!yr) return null;
    var cols = [];
    yr.forEach(function (c, i) { var m = c.match(/^`?(\d{2})$/); if (m) cols.push({ i: i, y: '20' + m[1] }); });
    var items = {};
    rows.forEach(function (r) {
      var label = r.find(function (c) { return c; }); if (!label) return;
      var li = r.indexOf(label);
      if (/검진년도|검진일자|항목|유의사항/.test(label)) return;
      var vals = {}; var any = false;
      cols.forEach(function (c) { if (c.i > li && r[c.i]) { vals[c.y] = r[c.i]; any = true; } });
      if (any) items[label] = { vals: vals, unit: r[r.length - 2] && !/^\d/.test(r[r.length - 2]) ? r[r.length - 2] : '' };
    });
    var years = cols.filter(function (c) { return dt && dt[c.i]; }).map(function (c) { return { y: c.y, d: dt[c.i] }; });
    return { years: years, items: items };
  }
  function parseCheckup(text) {
    var out = { date: '', judge: '', lines: [] };
    var m = text.match(/검진일\s*([\d.]+)/); if (m) out.date = m[1];
    var lines = text.split('\n'), res = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (/^▷/.test(l)) { var s = l.replace(/^▷\s*/, ''); var j = i + 1; while (j < lines.length && lines[j].trim() && !/^[▷◆※*]/.test(lines[j].trim()) && j < i + 4) { s += ' ' + lines[j].trim(); j++; } res.push(s); }
    }
    out.lines = res;
    var n = text.match(/성명\s*(\S+)/); if (n) out.name = n[1];
    return out;
  }

  // files: [{name, data:Uint8Array}] → {input, meta, states, needPw, sheetPw}
  async function ingest(L, files, birth, onProgress) {
    var A = L.Analyzer;
    var input = {}, meta = { checkupAll: null, checkup: null, name: '', kinds: {} }, states = {};
    var pws = pwList(birth), needPw = false, sheetPw = false, sheetWhy = '';
    var seen = {};
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (onProgress) onProgress(i, files.length, f.name);
      if (sniff(f.data) === 'sheet') {
        var unlocked = false;
        try {
          if (!L.XLSX) throw new Error('엑셀 읽기 모듈을 불러오지 못했습니다');
          var wb;
          try { wb = L.XLSX.read(f.data, { type: 'array' }); }
          catch (e0) {
            // 잠긴 엑셀: 먼저 프로그램 안에서 직접 풀기(휴대폰·PC 모두) → 안 되면 PC의 엑셀로
            if (!/password|encrypt|암호/i.test(String(e0 && e0.message))) throw e0;
            var plain = null, X = (typeof XlsCrypt !== 'undefined') ? XlsCrypt : null;
            if (X) { try { plain = (await X.tryAll(f.data, pws)).data; } catch (ex) { if (ex && ex.code === 'BADPW' && !L.unlockSheet) { var bp = new Error('password-protected'); bp.unlockWhy = 'badpw'; throw bp; } } }
            if (!plain && !L.unlockSheet) throw e0;
            if (!plain) try { plain = await L.unlockSheet(f.data, pws); }
            catch (e1) {
              var why = String(e1 && e1.message || e1);
              var er = new Error('password-protected'); er.unlockWhy = /NOEXCEL/.test(why) ? 'noexcel' : /BADPW/.test(why) ? 'badpw' : 'fail'; throw er;
            }
            wb = L.XLSX.read(plain, { type: 'array' }); unlocked = true;
          }
          var trows = []; wb.SheetNames.forEach(function (sn) { trows = trows.concat(L.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' })); });
          var tk = A.buildTuyak(trows);
          if (tk.length) { input.tuyak = (input.tuyak || []).concat(tk); meta.kinds.tuyak = 1; states[f.name] = { ok: true, kind: '투약이력 ' + tk.length + '건' + (unlocked ? ' (암호 자동 해제)' : '') }; }
          else states[f.name] = { bad: true, kind: '투약이력 형식 아님' };
        } catch (e) {
          var enc = /password|encrypt|암호/i.test(String(e && e.message));
          var lab = e && e.unlockWhy === 'noexcel' ? '암호 해제 실패 · 이 PC에 엑셀 없음' : e && e.unlockWhy === 'badpw' ? '암호 해제 실패 · 생년월일 불일치' : e && e.unlockWhy ? '암호 해제 실패' : '암호 해제 필요';
          states[f.name] = { bad: true, kind: enc ? lab : '읽기 실패' };
          if (enc) { sheetPw = true; sheetWhy = e && e.unlockWhy || ''; }
        }
        continue;
      }
      try {
        var r = await readPdf(L, f.data.slice ? f.data.slice(0) : f.data, pws);
        states[f.name] = { ok: r.kind !== 'unknown', bad: r.kind === 'unknown', kind: r.kind === 'coverage' ? (r.cov.kind === 'kb' ? 'KB 보장분석' : '메리츠 보장분석') + ' · 계약 ' + r.cov.contracts.length + '건' : KIND_LABEL[r.kind] };
        if (r.kind === 'coverage') { (meta.covList = meta.covList || []).push(r.cov); continue; }
        meta.kinds[r.kind] = 1; if (/자동차/.test(f.name) || /자동차/.test(r.text || '')) meta.kinds.car = 1;
        var dd = function (arr) { return arr.filter(function (x) { var k = r.kind + JSON.stringify(x); if (seen[k]) return false; seen[k] = 1; return true; }); };
        if (r.kind === 'basic') input.basic = (input.basic || []).concat(dd(A.buildBasic(r.rows)));
        if (r.kind === 'detail') input.detail = (input.detail || []).concat(dd(A.buildDetail(r.rows)));
        if (r.kind === 'rx') input.rx = (input.rx || []).concat(dd(A.buildRx(r.rows)));
        if (r.kind === 'recent') {
          var rc = A.buildRecent(r.rows);
          if (!input.recent) input.recent = rc;
          else { var ks = {}; input.recent.rows.forEach(function (x) { ks[x.date + '|' + x.hosp + '|' + x.code] = 1; }); rc.rows.forEach(function (x) { if (!ks[x.date + '|' + x.hosp + '|' + x.code]) input.recent.rows.push(x); }); if (rc.period > input.recent.period) input.recent.period = rc.period; }
          var nm = r.rows.find(function (x) { return x.indexOf('성명') >= 0; }); if (nm) meta.name = nm.filter(function (c) { return c; })[1] || meta.name;
          var rr = r.rows.map(function (x) { return x.join(' '); }).join(' ').match(/\d{6}-([1-8])/); if (rr) meta.sex = /[1357]/.test(rr[1]) ? 'M' : 'F';
        }
        if (r.kind === 'checkupAll') meta.checkupAll = parseCheckupAll(r.rows);
        if (r.kind === 'checkup') { var rr2 = (r.text || '').match(/\d{6}-([1-8])/); if (rr2 && !meta.sex) meta.sex = /[1357]/.test(rr2[1]) ? 'M' : 'F'; meta.checkup = parseCheckup(r.text); if (meta.checkup.name && !meta.name) meta.name = meta.checkup.name; }
      } catch (e) {
        states[f.name] = { bad: true, kind: e && e.code === 'PASSWORD' ? '비밀번호 오류' : '읽기 실패' };
        if (e && e.code === 'PASSWORD') needPw = true;
      }
    }
    if (input.tuyak) input.rx = A.mergeRx(input.rx || [], input.tuyak);
    var coverage = meta.covList && L.Coverage ? L.Coverage.merge(meta.covList) : null; delete meta.covList;
    var medical = !!(input.basic || input.recent || meta.checkupAll || meta.checkup);
    return { coverage: coverage, medical: medical, covOnly: !!coverage && !medical && !Object.keys(input).length, input: input, meta: meta, states: states, needPw: needPw, sheetPw: sheetPw, sheetWhy: sheetWhy, ok: medical || !!coverage };
  }

  var api = { ingest: ingest, sniff: sniff, pwList: pwList, KIND_LABEL: KIND_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Ingest = api;
})(this);
