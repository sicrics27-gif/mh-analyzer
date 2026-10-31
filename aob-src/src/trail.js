// 내 동선(활동 기록) — 구글 지도 타임라인 내보내기 파일을 읽어 날짜별 방문·이동으로 정리 (브라우저/Node 공용)
// 지원: ① 안드로이드 구글지도 앱 "타임라인 데이터 내보내기" (Timeline.json, semanticSegments)
//      ② 아이폰 구글지도 앱 내보내기 (location-history.json, 배열)
//      ③ 예전 Google 테이크아웃 "Semantic Location History" (timelineObjects)
//      ④ 예전 테이크아웃 Records.json (좌표만 · 경로로만 씀)
// 대표님 본인의 위치만 다룹니다. 고객 정보는 들어가지 않습니다.
(function (root) {
  function seoul(iso) {
    var d = new Date(iso); if (isNaN(d)) return null;
    var s = d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul', hour12: false }); // "2026-10-26 14:05:00"
    return { day: s.slice(0, 10), hm: s.slice(11, 16), ms: d.getTime() };
  }
  // "37.5012°, 127.0396°" | "geo:37.5012,127.0396" | {latLng:"..."} | {latitudeE7, longitudeE7}
  function ll(v) {
    if (!v) return null;
    if (typeof v === 'object') {
      if (v.latLng) return ll(v.latLng);
      if (v.latitudeE7 != null) return [v.latitudeE7 / 1e7, v.longitudeE7 / 1e7];
      if (v.lat != null && (v.lng != null || v.lon != null)) return [+v.lat, +(v.lng != null ? v.lng : v.lon)];
      return null;
    }
    var m = String(v).replace(/^geo:/, '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null; var a = +m[1], b = +m[2]; if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 90) return null; return [a, b];
  }
  function dist(a, b) { // km
    var R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180, s = Math.sin(dLat / 2), t = Math.sin(dLng / 2);
    var h = s * s + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * t * t; return 2 * R * Math.asin(Math.sqrt(h));
  }
  var MODE = { IN_PASSENGER_VEHICLE: '차', IN_VEHICLE: '차', IN_BUS: '버스', IN_SUBWAY: '지하철', IN_TRAIN: '기차', WALKING: '도보', RUNNING: '달리기', CYCLING: '자전거', MOTORCYCLING: '오토바이', IN_TAXI: '택시', FLYING: '비행', UNKNOWN: '이동', unknown: '이동', walking: '도보', 'in passenger vehicle': '차' };
  function modeTxt(t) { if (!t) return '이동'; var k = String(t).trim(); return MODE[k] || MODE[k.toUpperCase().replace(/\s+/g, '_')] || '이동'; }

  function day(out, d) { return out.days[d] = out.days[d] || { v: [], t: [], p: [], km: 0 }; }
  function addVisit(out, s, e, pos, name) {
    var a = seoul(s), b = seoul(e); if (!a || !pos) return;
    if (!b) b = a; var min = Math.max(0, Math.round((b.ms - a.ms) / 60000));
    if (min < 3) return; // 3분 미만 정차는 뺌
    var D = day(out, a.day); D.v.push({ s: a.hm, e: b.day === a.day ? b.hm : '24:00', lat: +pos[0].toFixed(5), lng: +pos[1].toFixed(5), min: min, name: name || '' });
  }
  function addTrip(out, s, e, km, mode, from, to) {
    var a = seoul(s), b = seoul(e); if (!a) return; if (!b) b = a;
    var D = day(out, a.day); km = +km || (from && to ? dist(from, to) : 0); var t = { s: a.hm, e: b.hm, km: Math.round(km * 10) / 10, mode: modeTxt(mode) };
    if (from) t.a = [+from[0].toFixed(5), +from[1].toFixed(5)]; if (to) t.b = [+to[0].toFixed(5), +to[1].toFixed(5)]; D.t.push(t); D.km += km;
  }
  function addPath(out, pts) { // [{ll, ms}]
    pts.forEach(function (p) { var a = seoul(new Date(p.ms).toISOString()); if (!a) return; var D = day(out, a.day), last = D.p[D.p.length - 1]; if (last && dist(last, p.ll) < 0.03) return; D.p.push([+p.ll[0].toFixed(5), +p.ll[1].toFixed(5), a.hm]); });
  }

  function parse(text) {
    var j; try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: '파일을 읽지 못했습니다 (JSON 형식이 아닙니다)' }; }
    var out = { days: {}, kind: '' }, segs = null;
    if (j && Array.isArray(j.semanticSegments)) { segs = j.semanticSegments; out.kind = 'android'; }
    else if (Array.isArray(j) && j.length && (j[0].visit || j[0].activity || j[0].timelinePath || j[0].startTime)) { segs = j; out.kind = 'ios'; }
    if (segs) {
      segs.forEach(function (sg) {
        var s = sg.startTime, e = sg.endTime;
        if (sg.visit) { var tc = sg.visit.topCandidate || {}; addVisit(out, s, e, ll(tc.placeLocation), tc.name || ''); }
        else if (sg.activity) { var ac = sg.activity, tc2 = ac.topCandidate || {}; addTrip(out, s, e, (+ac.distanceMeters || 0) / 1000, tc2.type, ll(ac.start), ll(ac.end)); }
        else if (Array.isArray(sg.timelinePath)) {
          var t0 = new Date(s).getTime(), pts = [];
          sg.timelinePath.forEach(function (p) { var pos = ll(p.point); if (!pos) return; var ms = p.time ? new Date(p.time).getTime() : t0 + (+p.durationMinutesOffsetFromStartTime || 0) * 60000; pts.push({ ll: pos, ms: ms }); });
          addPath(out, pts);
        }
      });
    } else if (j && Array.isArray(j.timelineObjects)) {
      out.kind = 'takeout';
      j.timelineObjects.forEach(function (o) {
        if (o.placeVisit) { var pv = o.placeVisit, du = pv.duration || {}; addVisit(out, du.startTimestamp || du.startTimestampMs && +du.startTimestampMs, du.endTimestamp || du.endTimestampMs && +du.endTimestampMs, ll(pv.location), (pv.location && (pv.location.name || pv.location.address)) || ''); }
        else if (o.activitySegment) { var as = o.activitySegment, d2 = as.duration || {}; addTrip(out, d2.startTimestamp || +d2.startTimestampMs, d2.endTimestamp || +d2.endTimestampMs, (+as.distance || 0) / 1000, as.activityType, ll(as.startLocation), ll(as.endLocation));
          var wp = (as.waypointPath && as.waypointPath.waypoints) || (as.simplifiedRawPath && as.simplifiedRawPath.points) || [];
          var t0 = new Date(d2.startTimestamp || +d2.startTimestampMs).getTime(), t1 = new Date(d2.endTimestamp || +d2.endTimestampMs).getTime(), pts = [];
          wp.forEach(function (p, i) { var pos = ll({ latitudeE7: p.latE7 != null ? p.latE7 : p.latitudeE7, longitudeE7: p.lngE7 != null ? p.lngE7 : p.longitudeE7 }); if (pos) pts.push({ ll: pos, ms: p.timestamp ? new Date(p.timestamp).getTime() : t0 + (t1 - t0) * (i / Math.max(1, wp.length - 1)) }); });
          addPath(out, pts);
        }
      });
    } else if (j && Array.isArray(j.locations)) {
      out.kind = 'records'; var pts = [];
      j.locations.forEach(function (p) { var pos = ll(p); if (!pos) return; var ms = p.timestamp ? new Date(p.timestamp).getTime() : +p.timestampMs; if (ms) pts.push({ ll: pos, ms: ms }); });
      pts.sort(function (a, b) { return a.ms - b.ms; }); addPath(out, pts);
    } else return { ok: false, error: '구글 타임라인 파일이 아닌 것 같습니다 (Timeline.json / location-history.json 을 넣어 주세요)' };
    return fin(out);
  }
  function fin(out) {
    // 정리: 시간순 정렬, 같은 자리 연속 방문 합치기
    Object.keys(out.days).forEach(function (d) {
      var D = out.days[d]; D.v.sort(function (a, b) { return a.s < b.s ? -1 : 1; }); D.t.sort(function (a, b) { return a.s < b.s ? -1 : 1; });
      var m = []; D.v.forEach(function (v) { var l = m[m.length - 1]; if (l && dist([l.lat, l.lng], [v.lat, v.lng]) < 0.08 && v.s <= l.e) { l.e = v.e > l.e ? v.e : l.e; l.min += v.min; if (!l.name) l.name = v.name; } else m.push(v); }); D.v = m;
      D.km = Math.round(D.km * 10) / 10;
    });
    var days = Object.keys(out.days).sort(); out.from = days[0] || ''; out.to = days[days.length - 1] || ''; out.n = days.length;
    out.visits = days.reduce(function (s, d) { return s + out.days[d].v.length; }, 0); out.ok = true;
    return out;
  }

  // 휴대폰이 자동으로 모은 위치점 [[ms, lat, lng, 정확도m], ...] → 방문(머문 곳)·이동·경로
  function fromPoints(pts) {
    var P = (pts || []).filter(function (p) { return p && isFinite(p[1]) && isFinite(p[2]) && (!p[3] || p[3] <= 200); }).sort(function (a, b) { return a[0] - b[0]; });
    var out = { days: {}, kind: 'auto' }, iso = function (ms) { return new Date(ms).toISOString(); }, STAY = 8 * 60000, R = 0.12;
    var i = 0, lastEnd = null, path = [];
    var trip = function (toLL, toMs) {
      if (!lastEnd || !path.length) { path = []; return; }
      var km = 0, prev = lastEnd.ll; path.forEach(function (p) { km += dist(prev, [p[1], p[2]]); prev = [p[1], p[2]]; }); km += dist(prev, toLL);
      var h = Math.max(1, toMs - lastEnd.ms) / 3600000, sp = km / h;
      if (km >= 0.3) addTrip(out, iso(lastEnd.ms), iso(toMs), km, sp >= 8 ? 'IN_PASSENGER_VEHICLE' : 'WALKING', lastEnd.ll, toLL);
      path = [];
    };
    while (i < P.length) {
      var j = i, c = [P[i][1], P[i][2]], n = 1;
      while (j + 1 < P.length && dist(c, [P[j + 1][1], P[j + 1][2]]) < R) { j++; n++; c = [c[0] + (P[j][1] - c[0]) / n, c[1] + (P[j][2] - c[1]) / n]; }
      var s0 = P[i][0], e0 = P[j][0];
      // 가만히 있으면 휴대폰이 위치를 잘 안 보냄 → 다음 점까지 오래 비면 그동안 머문 것으로 봄 (이동 시간은 시속 30km로 빼기)
      if (j + 1 < P.length) { var gap = P[j + 1][0] - e0, dk = dist(c, [P[j + 1][1], P[j + 1][2]]), travel = dk / 30 * 3600000; if (gap - travel >= STAY) e0 = Math.max(e0, P[j + 1][0] - travel); }
      else if (Date.now() - e0 < 30 * 60000) e0 = Math.max(e0, Math.min(Date.now(), e0 + 30 * 60000)); // 지금 머무는 중
      if (e0 - s0 >= STAY) { trip(c, s0); addVisit(out, iso(s0), iso(e0), c, ''); lastEnd = { ll: c, ms: e0 }; i = j + 1; }
      else { path.push(P[i]); if (!lastEnd) lastEnd = { ll: [P[i][1], P[i][2]], ms: P[i][0] }; i++; }
    }
    addPath(out, P.map(function (p) { return { ll: [p[1], p[2]], ms: p[0] }; }));
    return fin(out);
  }
  // 그날의 길: 방문·이동·경로점을 시간순으로 이어 붙임 → [[lat,lng],...]
  function route(D) {
    var pts = [];
    (D.v || []).forEach(function (v) { pts.push([v.s, v.lat, v.lng]); pts.push([v.e, v.lat, v.lng]); });
    (D.t || []).forEach(function (t) { if (t.a) pts.push([t.s, t.a[0], t.a[1]]); if (t.b) pts.push([t.e, t.b[0], t.b[1]]); });
    (D.p || []).forEach(function (p) { if (p[2]) pts.push([p[2], p[0], p[1]]); });
    pts.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var out = []; pts.forEach(function (p) { var l = out[out.length - 1]; if (l && Math.abs(l[0] - p[1]) < 1e-5 && Math.abs(l[1] - p[2]) < 1e-5) return; out.push([p[1], p[2]]); });
    return out;
  }
  var api = { parse: parse, fromPoints: fromPoints, dist: dist, seoul: seoul, modeTxt: modeTxt, route: route };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trail = api;
})(this);
