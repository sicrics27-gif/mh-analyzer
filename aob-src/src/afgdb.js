// 회사 DB 사이트(link.afg.kr) 화면에서 복사한 글을 고객 정보로 나누기 (브라우저/Node 공용)
// 대표님이 직접 보고 있는 화면을 복사한 것만 다룸 — 사이트에 자동 접속하지 않음.
(function (root) {
  var SIDO = '서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주';
  var SIDO_RE = new RegExp('^(' + SIDO + ')(특별시|광역시|특별자치시|특별자치도|도)?$');
  var STATUS = ['부재', 'TA거절', '상담중', '가입불가(AS신청)', 'AS재신청', 'AS승인', '상담완료', '청약완료', '전산완료'];
  var PH_FULL = /01[016789]-?\d{3,4}-?\d{4}/;
  var PH_ANY = /^01[016789][-*\d]{7,11}$/;
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function last4(s) { var d = String(s || '').replace(/[^\d]/g, ''); return d.length >= 4 ? d.slice(-4) : ''; }
  function sexOf(s) { return /^여/.test(s) ? 'F' : /^남/.test(s) ? 'M' : ''; }
  function isName(s) { return /^[가-힣]{2,5}$/.test(s) && !/^(남자|여자|기혼|미혼|부재|상담중|강남혁|담당자|고객명|연락처)$/.test(s); }
  // 특이사항에서 지역(시·구·동)과 근처 장소만 뽑기 (번지수는 버림)
  function areaFrom(text) {
    var t = String(text || '');
    var m = new RegExp('(' + SIDO + ')\\S*\\s+(\\S+[구군시])(?:\\s+(\\S+[동읍면리가]))?').exec(t);
    var area = m ? [m[1], m[2], m[3]].filter(Boolean).join(' ') : '';
    var near = '';
    var n = /([가-힣A-Za-z0-9]+(?:학교|역|병원|시장|아파트|마트|공원|타워|빌딩|센터|사거리|교회|성당))\s*(근처|부근|앞|옆|인근)?/.exec(t);
    if (n) near = n[1] + (n[2] ? ' ' + n[2] : ' 근처');
    return { area: area, near: near };
  }

  // [AFG-DB] 버튼(북마크)으로 복사한 상세 화면
  function parseDetail(text) {
    var head = text.split('[PAGE]')[0], page = text.split('[PAGE]')[1] || '';
    var lines = head.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(1);
    var kv = lines.map(function (l) { var i = l.indexOf(': '); return i > 0 && i < 20 ? { k: l.slice(0, i), v: l.slice(i + 2).trim() } : { k: '', v: l }; });
    var p = { src: 'detail' };
    var pick = function (re) { var f = kv.find(function (x) { return re.test(x.k); }); return f ? f.v : ''; };
    p.name = pick(/고객명|성명|이름/); if (!isName(p.name)) p.name = (kv.find(function (x) { return isName(x.v); }) || {}).v || '';
    var ph = kv.map(function (x) { return x.v; }).find(function (v) { return PH_FULL.test(v) && !/\*/.test(v); });
    if (ph) p.phone = digits(ph.match(PH_FULL)[0]);
    var mk = (page.match(/01[016789]-?\*{3,4}-?\d{4}/) || [])[0]; if (mk) p.phoneMask = mk;
    var bd = kv.map(function (x) { return x.v; }).find(function (v) { return /^(19|20)\d{2}-\d{2}-\d{2}$/.test(v); });
    if (bd) p.birth = bd.replace(/-/g, '');
    var age = pick(/나이/); if (/^\d{1,3}$/.test(age)) p.age = +age; else { var ag = kv.find(function (x) { return /^\d{2}$/.test(x.v); }); if (ag) p.age = +ag.v; }
    kv.forEach(function (x) {
      var m = /^\[선택\]\s*(.+)$/.exec(x.v); if (!m) return; var s = m[1].trim();
      if (/^(남자?|여자?)$/.test(s)) p.sex = sexOf(s);
      else if (/^(기혼|미혼)$/.test(s)) p.married = s;
      else if (STATUS.indexOf(s) >= 0) p.status = s;
    });
    var memo = pick(/특이사항|메모/) || kv.map(function (x) { return x.v; }).filter(function (v) { return v.length > 15 && !/^\[선택\]|^https?:/.test(v) && !PH_FULL.test(v); }).sort(function (a, b) { return b.length - a.length; })[0] || '';
    if (memo) p.memo = memo;
    var vals = kv.map(function (x) { return x.v; }), si = vals.findIndex(function (v) { return SIDO_RE.test(v); });
    var A = areaFrom(memo);
    p.area = si >= 0 ? [vals[si].replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, ''), /[구군시]$/.test(vals[si + 1] || '') ? vals[si + 1] : ''].filter(Boolean).join(' ') : '';
    if (A.area && (!p.area || A.area.indexOf(p.area) === 0)) p.area = A.area;
    if (A.near) p.near = A.near;
    var g = function (re) { var m = re.exec(page); return m ? m[1] : ''; };
    p.distAt = g(/배분일시\s*(\d{4}-\d{2}-\d{2})/); p.regAt = g(/등록일시\s*(\d{4}-\d{2}-\d{2})/);
    p.asDue = g(/AS\s*신청\s*:\s*마감\s*(\d{4}-\d{2}-\d{2})/);
    if (!p.status) { var st = g(/인수상태\s*(?:\n\s*)?([^\n]+)/); if (STATUS.indexOf(st.trim()) >= 0) p.status = st.trim(); }
    return p.name ? [p] : [];
  }

  // 목록 표를 복사한 글 (PC는 칸이 탭, 휴대폰은 칸마다 줄바꿈)
  function parseList(text) {
    var out = [], seen = {};
    var rows = text.split('\n');
    var tabbed = rows.filter(function (r) { return r.split('\t').length >= 5; }).length >= 1;
    var groups = tabbed ? rows.map(function (r) { return r.split('\t').map(function (x) { return x.trim(); }).filter(Boolean); }) : [rows.map(function (x) { return x.trim(); }).filter(Boolean)];
    groups.forEach(function (tk) {
      for (var i = 0; i < tk.length; i++) {
        if (!PH_ANY.test(tk[i].replace(/\s/g, ''))) continue;
        var name = isName(tk[i - 1]) ? tk[i - 1] : '';
        if (!name) continue;
        var p = { src: 'list', name: name };
        var ph = tk[i].replace(/\s/g, '');
        if (/\*/.test(ph)) p.phoneMask = ph; else p.phone = digits(ph);
        var j = i + 1;
        if (/^\d{1,3}$/.test(tk[j] || '')) { p.age = +tk[j]; j++; }
        if (/^(남자?|여자?)$/.test(tk[j] || '')) { p.sex = sexOf(tk[j]); j++; }
        if (/^(기혼|미혼)$/.test(tk[j] || '')) { p.married = tk[j]; j++; }
        // 같은 줄(또는 바로 앞 몇 칸)의 등록일·인수상태·지역
        for (var k = i - 2; k >= Math.max(0, i - 14); k--) {
          var t = tk[k];
          if (PH_ANY.test(t.replace(/\s/g, '')) && k < i - 1) break;
          if (!p.regAt && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(t)) p.regAt = t.slice(0, 10);
          else if (STATUS.indexOf(t) >= 0) p.status = t; // 가장 왼쪽(인수상태 칸)이 남도록
          else if (!p.area && new RegExp('^(' + SIDO + ')\\s+\\S+[구군시]$').test(t)) p.area = t;
        }
        var key = name + '|' + last4(p.phone || p.phoneMask);
        if (seen[key]) { Object.keys(p).forEach(function (x) { if (!seen[key][x]) seen[key][x] = p[x]; }); continue; }
        seen[key] = p; out.push(p);
      }
    });
    return out;
  }

  function parse(text) {
    text = String(text || '').replace(/\r/g, '');
    if (/^\s*\[AFG-DB\]/.test(text)) {
      var all = [], seen = {};
      text.split(/\n?\[END\]\n?/).forEach(function (b) { if (!/\[AFG-DB\]/.test(b)) return; parseDetail(b.slice(b.indexOf('[AFG-DB]'))).forEach(function (p) { var k = p.name + '|' + (p.phone || p.birth || ''); if (seen[k]) return; seen[k] = 1; all.push(p); }); });
      return { kind: 'detail', people: all };
    }
    return { kind: 'list', people: parseList(text) };
  }

  // 기존 고객과 같은 사람인지
  function sameAs(p, c) {
    if (!c || c.name !== p.name) return false;
    if (p.birth && c.birth) return p.birth === c.birth;
    var a = last4(p.phone || p.phoneMask), b = last4(c.phone || (c.db && c.db.mask));
    if (a && b) return a === b;
    return !!(c.db) || !c.birth;
  }

  // 메모 글에서 만남 선호 짐작 (예: "주말오후방문", "평일 18시 이후")
  function meetFrom(text) {
    var t = String(text || ''), m = {};
    if (/주말/.test(t) && !/평일/.test(t)) m.days = 'we'; else if (/평일/.test(t) && !/주말/.test(t)) m.days = 'wk';
    var sl = []; if (/오전/.test(t)) sl.push('am'); if (/점심/.test(t)) sl.push('noon'); if (/오후/.test(t)) sl.push('pm'); if (/저녁|퇴근/.test(t)) sl.push('eve');
    if (sl.length) m.slots = sl;
    var h = /(\d{1,2})\s*시\s*(이후|부터|넘어|쯤|에만|만)?/.exec(t); if (h) m.time = h[0].replace(/\s+/g, ' ').trim();
    return m;
  }
  var api = { parse: parse, meetFrom: meetFrom, areaFrom: areaFrom, sameAs: sameAs, last4: last4, STATUS: STATUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AfgDb = api;
})(this);
