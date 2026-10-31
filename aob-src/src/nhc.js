// NHC(남혁컴퍼니) 보장분석부서 연결 — AOB(어센틱 오션브랜치 9팀, 구 AFG OC9)는 보장분석부서 산하 고객관리 프로그램.
// 회사로 나가는 것: 익명 의뢰서(성별·나이대·계약/담보), 숫자 통계. 이름·생년월일·연락처·병력은 절대 내보내지 않음.
(function (root) {
  var DEF_REPO = 'sicrics27-gif/nhc-company';
  var te = new TextEncoder(), td = new TextDecoder();
  var ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function b64enc(s) { var u = te.encode(s), bin = ''; for (var i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }
  function b64dec(b) { var bin = atob(String(b).replace(/\s/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return td.decode(u); }
  function newId() { var r = crypto.getRandomValues(new Uint8Array(8)), s = ''; for (var i = 0; i < 8; i++) s += ALPH[r[i] % 32]; return 'C-' + s; }

  // ---------- 보장 종류 (캠페인 대상 조건과 같은 이름) ----------
  var CATS = {
    cancer: { t: '암 진단', fn: function (n) { return /암/.test(n) && /진단/.test(n) && !(/유사암|소액암|제자리암|경계성/.test(n) && !/유사암\s*제외/.test(n)); } },
    brain: { t: '뇌혈관 진단', re: /(뇌혈관|뇌졸중|뇌출혈|뇌경색).*진단/ },
    heart: { t: '심장 진단', re: /(허혈성|심근경색|심장질환|심혈관).*진단/ },
    surgery: { t: '수술비', re: /수술/ },
    death: { t: '사망', re: /사망/ },
    driver: { t: '운전자', re: /(교통사고\s*처리|변호사선임|벌금)/ },
    care: { t: '간병', re: /간병/ },
    dementia: { t: '치매', re: /치매/ },
    fracture: { t: '골절', re: /골절/ }
  };
  function live(c, today) { return !c.end || c.end >= today; }
  function silGen(start) { return root.Coverage && root.Coverage.silsonGen ? root.Coverage.silsonGen(start) : 0; }

  // 만기 · 납입완료 · 갱신 (오늘부터 1년 안의 날짜만)
  function addY(d, n) { var y = +d.slice(0, 4) + n, md = d.slice(5); if (md === '02-29') md = '02-28'; return y + '-' + md; }
  function evs(c, today) {
    var out = [], lim = addY(today, 1), ok = function (d) { return d && d >= today && d <= lim; };
    var nm = String(c.product || '').slice(0, 40), co = String(c.company || '').slice(0, 20);
    if (/^\d{4}-\d{2}-\d{2}$/.test(c.end || '') && ok(c.end)) out.push({ t: '만기', d: c.end, co: co, p: nm });
    var st = /^\d{4}-\d{2}-\d{2}$/.test(c.start || '') ? c.start : '';
    if (!st) return out;
    var pm = String(c.pay || '').match(/(\d{1,2})\s*년(?!\s*갱신)/);
    if (pm && !c.paidUp) { var pe = addY(st, +pm[1]); if (ok(pe)) out.push({ t: '납입완료', d: pe, co: co, p: nm }); }
    var rn = 0, src = [c.product].concat((c.riders || []).map(function (r) { return r.name; }));
    src.forEach(function (n) { var m = String(n || '').match(/(\d{1,2})\s*년\s*갱신/); if (m && (!rn || +m[1] < rn)) rn = +m[1]; });
    if (!rn && /갱신형/.test(c.product || '') && c.silson) rn = 1;
    if (rn) { for (var k = rn; k <= 100; k += rn) { var rd = addY(st, k); if (rd >= today) { if (ok(rd) && rd !== c.end) out.push({ t: '갱신', d: rd, co: co, p: nm }); break; } } }
    return out;
  }
  // 고객 카드에 붙여 둘 작은 요약 (기기 안에서만 사용 · 브리핑/캠페인 대상 계산용)
  function facts(cov, sets, today) {
    var f = { has: {}, gens: [], ann: [], ev: [], at: today };
    if (cov && cov.contracts) {
      cov.contracts.forEach(function (c) {
        if (!live(c, today)) return;
        if (c.silson) { var g = silGen(c.start); if (g && f.gens.indexOf(g) < 0) f.gens.push(g); }
        if (c.start && /^\d{4}-\d{2}-\d{2}$/.test(c.start)) { var md = c.start.slice(5); if (f.ann.indexOf(md) < 0) f.ann.push(md); }
        (c.riders || []).forEach(function (r) {
          if (r.type === '실손') { f.has.silson = 1; return; }
          Object.keys(CATS).forEach(function (k) { var C = CATS[k]; if (C.fn ? C.fn(r.name) : C.re.test(r.name)) f.has[k] = (f.has[k] || 0) + (r.amount || 0) || 1; });
        });
        if (c.silson) f.has.silson = 1;
        evs(c, today).forEach(function (e) { f.ev.push(e); });
      });
      f.ev.sort(function (a, b) { return a.d < b.d ? -1 : 1; }); f.ev = f.ev.slice(0, 12);
      f.cov = 1;
      var lv = cov.contracts.filter(function (c) { return live(c, today); });
      f.nC = lv.length; f.prem = lv.reduce(function (s, c) { return s + (c.paidUp ? 0 : (c.premium || 0)); }, 0);
    }
    if (sets) {
      var open = sets.silOpen.concat(sets.flatOpen);
      f.claimN = open.length;
      f.claimAmt = open.reduce(function (s, x) { return s + (x.amt || 0); }, 0);
      var dl = open.map(function (x) { return x.deadline; }).filter(Boolean).sort();
      f.claimDue = dl[0] || '';
    }
    return f;
  }

  // ---------- 익명 의뢰서 ----------
  function ageOf(birth, today) {
    var b = String(birth || '').replace(/\D/g, ''); if (b.length !== 8) return null;
    var d = today.replace(/-/g, ''); var a = +d.slice(0, 4) - +b.slice(0, 4); if (d.slice(4) < b.slice(4)) a--; return a;
  }
  function deid(head, cov, today, ask) {
    var age = ageOf(head.birth, today);
    var clean = function (s, n) { return String(s || '').replace(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, '').slice(0, n); };
    return {
      v: 1, id: newId(), at: new Date().toISOString(), kind: 'cover', from: 'oc9',
      sex: head.sex === 'M' || head.sex === 'F' ? head.sex : '',
      age: age == null ? null : Math.floor(age / 5) * 5,
      ask: clean(ask, 300),
      contracts: (cov.contracts || []).filter(function (c) { return live(c, today); }).map(function (c) {
        return { company: clean(c.company, 30), product: clean(c.product, 80), start: c.start || '', end: c.end || '', premium: c.premium || null, paidUp: !!c.paidUp, silson: !!c.silson, gen: c.silson ? silGen(c.start) || null : null,
          riders: (c.riders || []).map(function (r) { return { type: clean(r.type, 8), name: clean(r.name, 90), amount: typeof r.amount === 'number' ? r.amount : null, amtText: clean(r.amtText, 30) }; }) };
      })
    };
  }

  // ---------- 캠페인 대상 ----------
  function matches(t, head, today) {
    t = t || {}; var f = head.cvx || {}, age = ageOf(head.birth, today);
    if (t.sex && head.sex !== t.sex) return false;
    if (t.ageMin && (age == null || age < t.ageMin)) return false;
    if (t.ageMax && (age == null || age > t.ageMax)) return false;
    if (t.stage && t.stage.length && t.stage.indexOf(head.stage || 'lead') < 0) return false;
    var needCov = (t.silson && t.silson.length) || (t.lacks && t.lacks.length) || (t.has && t.has.length);
    if (needCov && !f.cov) return false; // 보장분석이 없는 고객은 판단 불가 → 제외
    if (t.silson && t.silson.length && !(f.gens || []).some(function (g) { return t.silson.indexOf(g) >= 0; })) return false;
    if (t.lacks && t.lacks.length && !t.lacks.some(function (k) { return !(f.has || {})[k]; })) return false;
    if (t.has && t.has.length && !t.has.every(function (k) { return (f.has || {})[k]; })) return false;
    return true;
  }
  function targetTxt(t) {
    t = t || {}; var a = [];
    if (t.silson && t.silson.length) a.push('실손 ' + t.silson.join('·') + '세대');
    if (t.lacks && t.lacks.length) a.push(t.lacks.map(function (k) { return k === 'silson' ? '실손' : (CATS[k] || { t: k }).t; }).join('·') + ' 없음');
    if (t.has && t.has.length) a.push(t.has.map(function (k) { return k === 'silson' ? '실손' : (CATS[k] || { t: k }).t; }).join('·') + ' 있음');
    if (t.ageMin || t.ageMax) a.push((t.ageMin || '') + '~' + (t.ageMax || '') + '세');
    if (t.sex) a.push(t.sex === 'M' ? '남성' : '여성');
    if (t.stage && t.stage.length) a.push('단계 ' + t.stage.join('·'));
    return a.join(' · ') || '전체 고객';
  }

  // ---------- GitHub (회사 저장소) ----------
  function gh(cfg, path, opt) {
    opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opt.headers || {});
    opt.cache = 'no-store';
    return fetch('https://api.github.com/repos/' + (cfg.repo || DEF_REPO) + path, opt);
  }
  async function verify(cfg) {
    var r; try { r = await gh(cfg, ''); } catch (e) { throw new Error('인터넷에 연결되어 있지 않습니다'); }
    if (r.status === 401) throw new Error('토큰이 올바르지 않거나 만료되었습니다');
    if (r.status === 404) throw new Error('저장소를 찾을 수 없습니다 (토큰에 ' + (cfg.repo || DEF_REPO) + ' 접근 권한을 주었는지 확인)');
    if (!r.ok) throw new Error('회사 저장소에 접근할 수 없습니다 (' + r.status + ')');
    var j = await r.json(); if (!(j.permissions && j.permissions.push)) throw new Error('이 토큰에는 쓰기 권한(Contents: Read and write)이 없습니다');
    if (!j.private) throw new Error('회사 저장소가 공개 상태입니다. 비공개(Private)로 바꾼 뒤 연결하세요');
    return true;
  }
  async function getFile(cfg, path) {
    var r = await gh(cfg, '/contents/' + path + '?ref=main&t=' + Date.now());
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('회사 저장소 읽기 실패 (' + r.status + ')');
    var j = await r.json(); return { sha: j.sha, data: JSON.parse(b64dec(j.content)) };
  }
  async function putFile(cfg, path, obj, msg) {
    for (var t = 0; t < 2; t++) {
      var cur = null; try { cur = await getFile(cfg, path); } catch (e) {}
      var body = { message: msg, content: b64enc(JSON.stringify(obj, null, 1) + '\n'), branch: 'main' };
      if (cur) body.sha = cur.sha;
      var r = await gh(cfg, '/contents/' + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) return true;
      if (r.status !== 409 && r.status !== 422) throw new Error('회사로 보내지 못했습니다 (' + r.status + ')');
    }
    throw new Error('회사로 보내지 못했습니다. 잠시 후 다시 시도하세요');
  }
  async function delFile(cfg, path, sha, msg) {
    var r = await gh(cfg, '/contents/' + path, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, sha: sha, branch: 'main' }) });
    return r.ok || r.status === 404;
  }

  async function send(cfg, req) { await putFile(cfg, 'inbox/cover/' + req.id + '.json', req, '보장분석 의뢰 ' + req.id); return req.id; }
  // 결과 가져오기: 있으면 받아서 회사 저장소에서는 지움
  async function fetchResult(cfg, id) {
    var f = await getFile(cfg, 'outbox/cover/' + id + '.json');
    if (!f) return null;
    try { await delFile(cfg, 'outbox/cover/' + id + '.json', f.sha, '보장분석 결과 수령 ' + id); } catch (e) {}
    return f.data;
  }
  async function campaigns(cfg) { var f = await getFile(cfg, 'outbox/crm/campaigns.json'); return f ? f.data : null; }
  // AFG 통로 v2: 숫자만 (docs/afg-bridge.md) · 다른 항목은 그대로 두고 덮어씀
  async function tasks(cfg, o) { var f = null; try { f = await getFile(cfg, 'inbox/afg/tasks.json'); } catch (e) {} var d = Object.assign({}, f && f.data && f.data.v === 2 ? f.data : {}, o); await putFile(cfg, 'inbox/afg/tasks.json', d, 'AFG 업무 숫자 ' + o.date); }
  async function stats(cfg, st) { await putFile(cfg, 'inbox/crm/stats.json', st, '고객관리 통계 ' + st.date); }
  // 푸시 알림 받을 휴대폰 주소(FCM 토큰) — 고객 정보 없음, 기기마다 한 칸
  async function pushToken(cfg, dev, token) { var f = null; try { f = await getFile(cfg, 'inbox/afg/push.json'); } catch (e) {} var d = (f && f.data) || { v: 1, devices: {} }; d.devices = d.devices || {}; d.devices[dev] = { t: token, at: new Date().toISOString().slice(0, 10), os: 'android' }; await putFile(cfg, 'inbox/afg/push.json', d, 'AOB9 푸시 기기 등록'); }  // NHC → OC9 참고 자료 (읽기만): 설계 요청 틀(request-templates.json) · MD 백과(md-spec.json). 이쪽에서 보내는 것은 없음
  async function afg(cfg, name) { if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error('잘못된 파일 이름'); var f = await getFile(cfg, 'outbox/afg/' + name); return f ? f.data : null; }

  var ROWS = { '10': '실손입원', '11': '실손통원', '12': '일반암', '13': '고액암', '14': '유사암', '15': '암통원일당', '16': '암수술', '17': '다빈치', '18': '특정면역항암', '19': '표적항암', '20': '세기조절', '21': '양성자', '22': '정위', '23': '중입자', '24': '항암방사선', '25': '항암약물',
    '26': '뇌혈관진단', '27': '뇌졸중진단', '28': '뇌출혈진단', '29': '뇌혈관수술', '30': '뇌경색혈전', '31': '허혈성진단', '32': '부정맥/심부전', '33': '급성심근경색', '34': '허혈성수술', '35': '심근경색혈전', '36': '질병수술', '37': '상해수술', '38': '1종수술', '39': '2종수술', '40': '3종수술', '41': '4종수술', '42': '5종수술', '43': '1-7종수술',
    '44': '질병후유장해', '45': '상해후유장해', '46': '질병입원일당', '47': '상해입원일당', '48': '응급실', '49': '일반사망', '50': '질병사망', '51': '상해/재해사망', '52': '골절', '53': '깁스', '54': '화상', '55': '배상책임', '56': '교통사고처리지원금', '57': '자동차벌금', '58': '변호사선임', '59': '자동차부상치료' };
  root.NHC = { DEF_REPO: DEF_REPO, ROWS: ROWS, CATS: CATS, facts: facts, deid: deid, matches: matches, targetTxt: targetTxt, ageOf: ageOf, newId: newId,
    verify: verify, send: send, fetchResult: fetchResult, campaigns: campaigns, stats: stats, tasks: tasks, afg: afg, pushToken: pushToken };
})(this);
