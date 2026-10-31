// PDF 표 추출 엔진 (브라우저/Node 공용) - pdf.js 3.11
(function (root) {
  function mul(m, n) {
    return [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  }
  function ap(m, x, y) { return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]; }

  async function pageSegments(pdfjsLib, page) {
    var OPS = pdfjsLib.OPS;
    var ol = await page.getOperatorList();
    var ctm = [1,0,0,1,0,0], stack = [], segs = [];
    for (var i = 0; i < ol.fnArray.length; i++) {
      var fn = ol.fnArray[i], args = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1,0,0,1,0,0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.constructPath) {
        var ops = args[0], co = args[1], k = 0, cur = null, start = null;
        for (var j = 0; j < ops.length; j++) {
          var o = ops[j];
          if (o === OPS.moveTo) { cur = ap(ctm, co[k], co[k+1]); start = cur; k += 2; }
          else if (o === OPS.lineTo) { var p = ap(ctm, co[k], co[k+1]); if (cur) segs.push([cur[0],cur[1],p[0],p[1]]); cur = p; k += 2; }
          else if (o === OPS.rectangle) {
            var x = co[k], y = co[k+1], w = co[k+2], h = co[k+3]; k += 4;
            var a = ap(ctm,x,y), b = ap(ctm,x+w,y), c = ap(ctm,x+w,y+h), d = ap(ctm,x,y+h);
            segs.push([a[0],a[1],b[0],b[1]],[b[0],b[1],c[0],c[1]],[c[0],c[1],d[0],d[1]],[d[0],d[1],a[0],a[1]]);
          }
          else if (o === OPS.curveTo) { k += 6; }
          else if (o === OPS.curveTo2 || o === OPS.curveTo3) { k += 4; }
          else if (o === OPS.closePath) { if (cur && start) segs.push([cur[0],cur[1],start[0],start[1]]); cur = start; }
        }
      }
    }
    return segs;
  }

  function clusterVals(vals, tol) {
    vals.sort(function(a,b){return a-b;});
    var out = [];
    vals.forEach(function(v){ if (!out.length || v - out[out.length-1] > tol) out.push(v); });
    return out;
  }

  // 한 페이지를 괘선 격자로 나눠 행 배열 반환 (각 행 = 셀 문자열 배열)
  async function pageTable(pdfjsLib, page) {
    var segs = await pageSegments(pdfjsLib, page);
    var H = [], V = [];
    segs.forEach(function(s){
      var dx = Math.abs(s[2]-s[0]), dy = Math.abs(s[3]-s[1]);
      if (dy < 0.8 && dx > 3) H.push({y:(s[1]+s[3])/2, x0:Math.min(s[0],s[2]), x1:Math.max(s[0],s[2])});
      else if (dx < 0.8 && dy > 3) V.push({x:(s[0]+s[2])/2, y0:Math.min(s[1],s[3]), y1:Math.max(s[1],s[3])});
    });
    var tc = await page.getTextContent();
    var items = tc.items.filter(function(it){ return it.str && it.str.trim(); }).map(function(it){
      var fs = Math.hypot(it.transform[2], it.transform[3]) || 8;
      return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, cx: it.transform[4] + it.width/2, cy: it.transform[5] + fs*0.35, fs: fs };
    });
    if (!H.length || !V.length) return { rows: [], items: items, H: H, V: V };
    var ys = clusterVals(H.map(function(h){return h.y;}), 1.5).reverse(); // 위 -> 아래 (PDF y는 위가 큼)
    var xs = clusterVals(V.map(function(v){return v.x;}), 1.5);
    var nR = ys.length - 1, nC = xs.length - 1;
    var grid = [];
    for (var r = 0; r < nR; r++) { grid.push([]); for (var c = 0; c < nC; c++) grid[r].push([]); }
    items.forEach(function(it){
      var r = -1, c = -1;
      for (var i = 0; i < nR; i++) if (it.cy <= ys[i] && it.cy > ys[i+1]) { r = i; break; }
      for (var j = 0; j < nC; j++) if (it.cx >= xs[j] && it.cx < xs[j+1]) { c = j; break; }
      if (r >= 0 && c >= 0) grid[r][c].push(it);
    });
    var rows = grid.map(function(row){
      return row.map(function(cell){
        cell.sort(function(a,b){ return Math.abs(a.y-b.y) > 2 ? b.y - a.y : a.x - b.x; });
        var out = '', last = null;
        cell.forEach(function(it){
          if (last) {
            if (Math.abs(it.y - last.y) > 2) out += '';            // 줄바꿈: 붙여쓰기
            else if (it.x - (last.x + last.w) > last.fs * 0.25) out += ' ';
          }
          out += it.s; last = it;
        });
        return out.replace(/\s+/g, ' ').trim();
      });
    }).filter(function(r){ return r.some(function(c){ return c; }); });
    return { rows: rows, items: items, H: H, V: V };
  }

  async function openPdf(pdfjsLib, data, passwords) {
    var tries = [undefined].concat(passwords || []);
    var lastErr;
    for (var i = 0; i < tries.length; i++) {
      try {
        var opts = { data: data.slice ? data.slice(0) : data, isEvalSupported: false };
        if (tries[i] !== undefined) opts.password = tries[i];
        var doc = await pdfjsLib.getDocument(opts).promise;
        return doc;
      } catch (e) {
        lastErr = e;
        if (!e || e.name !== 'PasswordException') throw e;
      }
    }
    var err = new Error('비밀번호가 맞지 않습니다');
    err.code = 'PASSWORD';
    throw err;
  }

  async function pageText(page) {
    var tc = await page.getTextContent();
    // y 기준 줄 단위 텍스트
    var its = tc.items.filter(function(it){return it.str.trim();}).map(function(it){ return {s:it.str, x:it.transform[4], y:it.transform[5], w:it.width}; });
    its.sort(function(a,b){ return Math.abs(a.y-b.y) > 3 ? b.y-a.y : a.x-b.x; });
    var lines = [], cur = null;
    its.forEach(function(it){
      if (!cur || Math.abs(cur.y - it.y) > 3) { cur = { y: it.y, parts: [] }; lines.push(cur); }
      cur.parts.push(it);
    });
    return lines.map(function(l){ return l.parts.map(function(p){return p.s;}).join(' ').replace(/\s+/g,' ').trim(); });
  }

  var api = { pageTable: pageTable, openPdf: openPdf, pageText: pageText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PdfTable = api;
})(this);

