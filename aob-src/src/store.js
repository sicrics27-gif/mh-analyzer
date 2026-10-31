// 고객 자료 보관: 이 기기(브라우저) 안 IndexedDB + 잠금 비밀번호로 AES-GCM 암호화. 서버 전송 없음.
(function (root) {
  var DB = 'mhs-local-v1', ITER = 250000;
  var key = null, mem = null, idleT = null, onLock = null, IDLE_MS = 30 * 60 * 1000;
  var te = new TextEncoder(), td = new TextDecoder();

  function b64(u) { var s = ''; u = new Uint8Array(u); for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function ub64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  function openDb() {
    return new Promise(function (res, rej) {
      var rq;
      try { rq = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = function () { var d = rq.result; ['meta', 'idx', 'data'].forEach(function (s) { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  var dbp = null;
  function db() { if (!dbp) dbp = openDb(); return dbp; }
  function tx(store, mode, fn) {
    if (mem) { var o = fn(memStore(store)); return Promise.resolve(o && o.__req ? o.__req.result : o); }
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        Promise.resolve(fn(s)).then(function (v) { out = v; });
        t.oncomplete = function () { res(out && out.__req ? out.__req.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  function req(r) { return { __req: r }; }
  // 저장소를 못 쓰는 화면(미리보기 등): 메모리에만 보관
  function memStore(name) {
    var m = mem[name] = mem[name] || {};
    return {
      get: function (k) { return { __req: { result: m[k] } }; },
      put: function (v, k) { m[k] = v; }, delete: function (k) { delete m[k]; },
      getAll: function () { return { __req: { result: Object.keys(m).map(function (k) { return m[k]; }) } }; },
      getAllKeys: function () { return { __req: { result: Object.keys(m) } }; }, clear: function () { mem[name] = {}; }
    };
  }
  function get(store, k) { return tx(store, 'readonly', function (s) { return req(s.get(k)); }); }
  function put(store, k, v) { return tx(store, 'readwrite', function (s) { s.put(v, k); }); }
  function del(store, k) { return tx(store, 'readwrite', function (s) { s.delete(k); }); }
  function all(store) { return tx(store, 'readonly', function (s) { return req(s.getAll()); }); }
  function clear(store) { return tx(store, 'readwrite', function (s) { s.clear(); }); }

  async function derive(pin, salt) {
    var base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function enc(obj, k) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k || key, te.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function dec(box, k) {
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(box.iv) }, k || key, ub64(box.ct));
    return JSON.parse(td.decode(pt));
  }
  // 잠금 해제 상태 유지: 앱이 다시 열려도(뒤로가기·로그인 다녀오기·새로고침) 마지막 사용 후 30분까지는 그대로 열림.
  // 열쇠는 '꺼낼 수 없는(non-extractable)' 형태로 이 기기 저장소에만 보관 → 비밀번호 자체는 어디에도 남지 않음.
  var lastAct = 0, lastPersist = 0;
  function persist(force) {
    if (mem || !key) return;
    var now = Date.now(); if (!force && now - lastPersist < 30000) return; lastPersist = now;
    put('meta', 'sess', { key: key, exp: now + IDLE_MS }).catch(function () { });
  }
  function touch() { clearTimeout(idleT); lastAct = Date.now(); if (key) { idleT = setTimeout(function () { lock(); }, IDLE_MS); persist(); } }
  function lock() { key = null; clearTimeout(idleT); lastPersist = 0; if (!mem) del('meta', 'sess').catch(function () { }); if (onLock) onLock(); }
  function checkIdle() { if (key && lastAct && Date.now() - lastAct > IDLE_MS) lock(); }
  async function resume() {
    if (mem || key) return !!key;
    try {
      var ss = await get('meta', 'sess'); if (!ss || !ss.key || !(ss.exp > Date.now())) return false;
      var v = await get('meta', 'vault'); if (!v || (await dec(v.check, ss.key)) !== 'ok') return false;
      key = ss.key; touch(); persist(true); return true;
    } catch (e) { return false; }
  }

  async function status() {
    if (!root.crypto || !crypto.subtle) return 'nocrypto';
    try { await db(); } catch (e) { mem = {}; }
    if (key) return 'open';
    if (await resume()) return 'open';
    var v = await get('meta', 'vault');
    return v ? 'locked' : 'new';
  }
  async function setup(pin) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    key = await derive(pin, salt);
    await put('meta', 'vault', { salt: b64(salt), iter: ITER, check: await enc('ok'), created: Date.now() });
    touch(); persist(true); return true;
  }
  async function unlock(pin) {
    var v = await get('meta', 'vault'); if (!v) return false;
    var k = await derive(pin, ub64(v.salt));
    try { if ((await dec(v.check, k)) !== 'ok') return false; } catch (e) { return false; }
    key = k; touch(); persist(true); return true;
  }
  async function wipe() { await clear('idx'); await clear('data'); await clear('meta'); key = null; }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  async function list() {
    touch();
    var rows = await all('idx');
    var out = [];
    for (var i = 0; i < rows.length; i++) { try { var h = await dec(rows[i]); if (!h.deleted && !h.hidden) out.push(h); } catch (e) { } }
    return out.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
  }
  var onChange = [];
  function changed() { onChange.forEach(function (f) { try { f(); } catch (e) { } }); }
  async function saveHead(h) { touch(); h.updated = Date.now(); if (!h.id) { h.id = uid(); h.created = h.updated; } await put('idx', h.id, await enc(h)); changed(); return h; }
  async function saveData(id, data) { touch(); await put('data', id, await enc(data)); }
  async function loadData(id) { touch(); var b = await get('data', id); return b ? dec(b) : null; }
  // 삭제: 다른 기기에도 삭제가 전달되도록 '삭제 표시'만 남김
  async function remove(id) { await put('idx', id, await enc({ id: id, deleted: true, updated: Date.now() })); await del('data', id); changed(); }

  // ---- 동기화용: 암호화된 그대로 주고받기 ----
  async function rawAll() {
    var keys = await tx('idx', 'readonly', function (s) { return req(s.getAllKeys()); });
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var hb = await get('idx', keys[i]); if (!hb) continue;
      var h; try { h = await dec(hb); } catch (e) { continue; }
      out.push({ id: keys[i], updated: h.updated || 0, deleted: !!h.deleted, head: hb });
    }
    return out;
  }
  async function rawData(id) { return get('data', id); }
  async function putRaw(id, headBox, dataBox) {
    var h = await dec(headBox);   // 같은 열쇠인지 확인 (안 맞으면 오류)
    await put('idx', id, headBox);
    if (dataBox) { await dec(dataBox); await put('data', id, dataBox); } else await del('data', id);
    return h;
  }
  // 두 기기에서 같은 고객을 고친 경우: 상담 기록·청구 기록은 양쪽 것을 합치고, 나머지는 나중에 고친 쪽
  function unionBy(a, b, key) { var m = {}, out = []; (a || []).concat(b || []).forEach(function (x) { var k = x && (x[key] != null ? x[key] : JSON.stringify(x)); if (k == null || m[k]) return; m[k] = 1; out.push(x); }); return out; }
  async function mergeRemote(id, rhBox, rdBox) {
    var rh = await dec(rhBox), lb = await get('idx', id), lh = lb ? await dec(lb) : null;
    if (!lh) return putRaw(id, rhBox, rdBox);
    var newer = (rh.updated || 0) >= (lh.updated || 0) ? 'r' : 'l';
    if (rh.deleted || lh.deleted) { if (newer === 'r') return putRaw(id, rhBox, rdBox); return lh; }
    var h = newer === 'r' ? Object.assign({}, lh, rh) : Object.assign({}, rh, lh);
    h.notes = unionBy(lh.notes, rh.notes, 'id').sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
    h.updated = Math.max(lh.updated || 0, rh.updated || 0) + 1;
    var ld = await get('data', id), rd = rdBox ? await dec(rdBox) : null; ld = ld ? await dec(ld) : null;
    var d = !rd ? ld : !ld ? rd : (newer === 'r' ? Object.assign({}, ld, rd) : Object.assign({}, rd, ld));
    if (d && ld && rd) {
      d.claimLog = unionBy(ld.claimLog, rd.claimLog, 'at').sort(function (x, y) { return x.at - y.at; });
      d.claimMarks = Object.assign({}, newer === 'r' ? ld.claimMarks : rd.claimMarks, newer === 'r' ? rd.claimMarks : ld.claimMarks);
    }
    await put('idx', id, await enc(h));
    if (d) await put('data', id, await enc(d));
    return h;
  }
  async function vault() { return get('meta', 'vault'); }
  // 다른 기기의 잠금(구글에 있는 것)으로 이 기기를 맞춤: 같은 비밀번호·같은 열쇠
  async function adoptVault(remote, pin) {
    var k = await derive(pin, ub64(remote.salt));
    try { if ((await dec(remote.check, k)) !== 'ok') return false; } catch (e) { return false; }
    var keys = await tx('idx', 'readonly', function (s) { return req(s.getAllKeys()); });
    for (var i = 0; i < keys.length; i++) {
      var hb = await get('idx', keys[i]); var db = await get('data', keys[i]);
      try {
        await put('idx', keys[i], await enc(await dec(hb), k));
        if (db) await put('data', keys[i], await enc(await dec(db), k));
      } catch (e) { }
    }
    await put('meta', 'vault', remote);
    key = k; touch(); persist(true);
    return true;
  }

  // 백업: 지금 잠금 비밀번호로 암호화된 그대로 내보냄
  async function exportBackup() {
    var v = await get('meta', 'vault');
    var idx = await tx('idx', 'readonly', function (s) { return req(s.getAll()); });
    var keys = await tx('idx', 'readonly', function (s) { return req(s.getAllKeys()); });
    var data = [];
    for (var i = 0; i < keys.length; i++) data.push(await get('data', keys[i]) || null);
    return JSON.stringify({ app: 'mhs-local', v: 1, exported: new Date().toISOString(), vault: v, keys: keys, idx: idx, data: data });
  }
  async function importBackup(text, pin) {
    var o = JSON.parse(text);
    if (o.app !== 'mhs-local' || !o.vault) throw new Error('백업 파일 형식이 아닙니다');
    var k = await derive(pin, ub64(o.vault.salt));
    try { if ((await dec(o.vault.check, k)) !== 'ok') throw 0; } catch (e) { var er = new Error('백업 파일 비밀번호가 맞지 않습니다'); er.code = 'PIN'; throw er; }
    var n = 0;
    for (var i = 0; i < o.keys.length; i++) {
      var h = await dec(o.idx[i], k);
      await put('idx', h.id, await enc(h));
      if (o.data[i]) await put('data', h.id, await enc(await dec(o.data[i], k)));
      n++;
    }
    return n;
  }

  ['pointerdown', 'keydown'].forEach(function (ev) { try { root.addEventListener(ev, function () { if (key) touch(); }, { passive: true }); } catch (e) { } });

  root.Store = {
    status: status, setup: setup, unlock: unlock, lock: lock, wipe: wipe,
    list: list, saveHead: saveHead, saveData: saveData, loadData: loadData, remove: remove,
    exportBackup: exportBackup, importBackup: importBackup,
    rawAll: rawAll, rawData: rawData, putRaw: putRaw, mergeRemote: mergeRemote, hasLocal: async function () { var k = await tx('idx', 'readonly', function (st) { return req(st.getAllKeys()); }); return (k || []).filter(function (x) { return x !== '__admin'; }).length; }, vault: vault, adoptVault: adoptVault,
    onChange: function (f) { onChange.push(f); }, isOpen: function () { return !!key; }, checkIdle: checkIdle,
    isMemory: function () { return !!mem; }, onLock: function (f) { onLock = f; }
  };
})(this);
