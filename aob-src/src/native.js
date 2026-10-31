// 진짜 안드로이드 앱(AOB9 앱) 안에서 열렸을 때만 작동: 크롬에만 있던 기능(음성 읽기·음성 인식·알림·공유·파일 저장)을
// 휴대폰 자체 기능으로 이어 줍니다. 크롬·PC에서는 아무 일도 하지 않습니다.
(function (root) {
  var C = root.Capacitor;
  var on = !!(C && C.isNativePlatform && C.isNativePlatform());
  function plug(n) { if (!on) return null; try { return (C.Plugins && C.Plugins[n]) || (C.registerPlugin && C.registerPlugin(n)) || null; } catch (e) { return null; } }
  var N = plug('AobNative');
  root.Native = { on: on, plug: plug, aob: N };
  // 폴더블(갤럭시 폴드 등)을 펼쳤을 때도 접었을 때와 같은 휴대폰 화면으로: 넓은 터치 화면이면 화면 폭을 680으로 맞춰 확대해서 보여 줌
  (function () {
    try {
      var touch = (navigator.maxTouchPoints || 0) > 0 && !(root.matchMedia && root.matchMedia('(pointer: fine)').matches) && !(root.__TAURI__);
      if (!touch) return;
      var fit = function () {
        var m = document.querySelector('meta[name=viewport]'); if (!m) return;
        var w = Math.max(screen.width, 0), want = (w > 600 && w <= 1180) ? 'width=680, viewport-fit=cover' : 'width=device-width, initial-scale=1, viewport-fit=cover';
        if (m.getAttribute('content') !== want) m.setAttribute('content', want);
      };
      fit(); root.addEventListener('resize', fit); root.addEventListener('orientationchange', function () { setTimeout(fit, 300); });
      if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', fit);
    } catch (e) { }
  })();
  if (!on) return;
  document.documentElement.classList.add('is-native');
  // 예전 앱(크롬 기반) 버전 확인 코드와 맞추기: 진짜 앱은 항상 '최신 기능 있음'
  try { sessionStorage.setItem('mhs_apk', sessionStorage.getItem('mhs_apk') || '999'); sessionStorage.setItem('mhs_native', '1'); } catch (e) { }
  if (N) N.info().then(function (r) { try { if (r && r.code) sessionStorage.setItem('mhs_apk', String(r.code)); } catch (e) { } }).catch(function () { });

  // ---------- 음성 읽기 (speechSynthesis 대신 휴대폰 TTS) ----------
  var T = plug('TextToSpeech');
  // 안드로이드 웹뷰의 기본 음성 읽기·인식은 이름만 있고 작동하지 않아서 항상 휴대폰 기능으로 바꿈
  if (T) {
    var voices = [], cur = null;
    T.getSupportedVoices().then(function (r) {
      voices = ((r && r.voices) || []).map(function (v, i) { return { name: v.name || v.voiceURI || ('voice' + i), lang: String(v.lang || '').replace('_', '-'), voiceURI: v.voiceURI || v.name, localService: true, default: false, _i: i }; });
    }).catch(function () { });
    function Utt(text) { this.text = text || ''; this.lang = 'ko-KR'; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.onend = null; this.onerror = null; this.onstart = null; }
    root.SpeechSynthesisUtterance = Utt;
    var synth = {
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      getVoices: function () { return voices.slice(); },
      speak: function (u) {
        synth.speaking = true; cur = u; if (u.onstart) try { u.onstart({}); } catch (e) { }
        var o = { text: u.text, lang: u.lang || 'ko-KR', rate: Math.max(0.1, Math.min(2, u.rate || 1)), pitch: Math.max(0.5, Math.min(2, u.pitch || 1)), volume: u.volume == null ? 1 : u.volume, category: 'playback' };
        if (u.voice && u.voice._i != null) o.voice = u.voice._i;
        T.speak(o).then(function () { if (cur !== u) return; synth.speaking = false; cur = null; if (u.onend) try { u.onend({}); } catch (e) { } })
          .catch(function (e) { if (cur !== u) return; synth.speaking = false; cur = null; if (u.onerror) try { u.onerror({ error: String(e && e.message || e) }); } catch (x) { } });
      },
      cancel: function () { var u = cur; cur = null; synth.speaking = false; T.stop().catch(function () { }); if (u && u.onend) try { u.onend({ canceled: true }); } catch (e) { } },
      pause: function () { }, resume: function () { },
      addEventListener: function () { }, removeEventListener: function () { }
    };
    try { Object.defineProperty(root, 'speechSynthesis', { value: synth, configurable: true }); } catch (e) { root.speechSynthesis = synth; }
  }

  // ---------- 음성 인식 (webkitSpeechRecognition 대신 휴대폰 음성 인식) ----------
  if (N) {
    var active = null, subs = [];
    function clearSubs() { subs.forEach(function (h) { try { h.remove(); } catch (e) { } }); subs = []; }
    function Rec() { this.lang = 'ko-KR'; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1; this.onresult = this.onend = this.onerror = this.onstart = this.onspeechend = this.onaudiostart = null; this._stop = false; this._final = []; }
    function fire(r, name, ev) { var f = r['on' + name]; if (f) try { f.call(r, ev || {}); } catch (e) { setTimeout(function () { throw e; }); } }
    Rec.prototype._listen = function () {
      var r = this;
      return Promise.all([
        N.addListener('speech', function (d) {
          if (active !== r) return;
          var idx = r._final.length, item = [{ transcript: d.text || '', confidence: 0.9 }]; item.isFinal = !!d.final;
          if (!d.final && !r.interimResults) return;
          var res = r._final.concat([item]); if (d.final) r._final.push(item);
          var list = res.map(function (x) { return x; }); list.item = function (i) { return list[i]; };
          fire(r, 'result', { resultIndex: idx, results: list });
        }),
        N.addListener('speechLevel', function (d) { if (active === r) root.dispatchEvent(new CustomEvent('aob-mic', { detail: +(d && d.v) || 0 })); }),
        N.addListener('speechEnd', function (d) {
          if (active !== r) return;
          var code = d && d.code || 0;
          // 이어 듣기(continuous): 조용해서 끊긴 경우 다시 듣기
          if (r.continuous && !r._stop && (code === 0 || code === 6 || code === 7)) { N.speechStart({ lang: r.lang }).catch(function () { r._end(); }); return; }
          if (code && code !== 6 && code !== 7) fire(r, 'error', { error: code === 9 ? 'not-allowed' : code === 2 ? 'network' : 'aborted', message: 'code ' + code });
          else if (code === 6 || code === 7) fire(r, 'error', { error: 'no-speech' });
          r._end();
        })
      ]).then(function (hs) { r._subs = hs; if (active !== r) hs.forEach(function (h) { try { h.remove(); } catch (e) { } }); });
    };
    Rec.prototype._end = function () { if (active !== this) return; active = null; (this._subs || []).forEach(function (h) { try { h.remove(); } catch (e) { } }); this._subs = null; fire(this, 'end'); };
    Rec.prototype.start = function () {
      var r = this; if (active && active !== r) active.abort();
      active = r; r._stop = false; r._final = [];
      // 시작 준비 중에 멈춤(pause)이 눌렸으면 휴대폰 마이크를 아예 켜지 않음 → 켜진 채 남아 상대 목소리가 묻히는 문제 방지
      r._listen().then(function () { if (active !== r || r._stop) return 'skip'; return N.speechStart({ lang: r.lang || 'ko-KR' }); })
        .then(function (x) { if (x === 'skip') return; if (active !== r || r._stop) { N.speechStop().catch(function () { }); return; } fire(r, 'start'); fire(r, 'audiostart'); })
        .catch(function (e) { var cd = String(e && (e.code || e.message)); fire(r, 'error', { error: /권한|not-allowed/.test(cd) ? 'not-allowed' : /unavailable/.test(cd) ? 'service-not-allowed' : 'audio-capture', message: String(e && e.message || e) }); r._end(); });
    };
    Rec.prototype.stop = function () { var r = this; r._stop = true; N.speechStop().catch(function () { }).then(function () { setTimeout(function () { r._end(); }, 300); }); };
    Rec.prototype.abort = function () { this._stop = true; N.speechStop().catch(function () { }); this._end(); };
    Rec.prototype.addEventListener = function (n, f) { this['on' + n] = f; };
    root.SpeechRecognition = root.webkitSpeechRecognition = Rec;
  }

  // ---------- 알림 (Notification 대신 휴대폰 알림) ----------
  var L = plug('LocalNotifications');
  if (L) {
    var perm = 'default', nid = 1;
    L.checkPermissions().then(function (p) { perm = p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default'; }).catch(function () { });
    function Noti(title, o) { o = o || {}; L.schedule({ notifications: [{ id: (nid++ % 100000) + 1, title: String(title || 'AOB9'), body: String(o.body || ''), smallIcon: 'ic_stat_aob', iconColor: '#3B6BFF' }] }).catch(function () { }); this.onclick = null; this.close = function () { }; }
    Object.defineProperty(Noti, 'permission', { get: function () { return perm; } });
    Noti.requestPermission = function (cb) { return L.requestPermissions().then(function (p) { perm = p.display === 'granted' ? 'granted' : 'denied'; if (cb) cb(perm); return perm; }).catch(function () { return perm; }); };
    root.Notification = Noti;
    // 매일 같은 시각 알림 (아침 연락 리스트) — 앱을 열 때마다 내용을 새로 맞춤
    root.Native.daily = function (id, title, body, hour, minute, go) {
      return L.cancel({ notifications: [{ id: id }] }).catch(function () { }).then(function () {
        if (perm !== 'granted') return false;
        return L.schedule({ notifications: [{ id: id, title: title, body: body, smallIcon: 'ic_stat_aob', iconColor: '#3B6BFF', extra: { go: go || '' }, schedule: { on: { hour: hour, minute: minute }, allowWhileIdle: true } }] }).then(function () { return true; });
      });
    };
    // 날짜·시각을 아는 알림 묶음(할 일·생일·갱신 등): 95000~95499 번호를 통째로 지우고 다시 예약 — 앱을 닫아도 울림
    root.Native.plan = function (items) {
      var ids = []; for (var i = 95000; i < 95500; i++) ids.push({ id: i });
      return L.cancel({ notifications: ids }).catch(function () { }).then(function () {
        if (perm !== 'granted' || !items || !items.length) return 0;
        return L.schedule({ notifications: items.slice(0, 400).map(function (x, i) { return { id: 95000 + i, title: x.title, body: x.body, smallIcon: 'ic_stat_aob', iconColor: '#3B6BFF', extra: { go: x.go || '' }, schedule: { at: new Date(x.at), allowWhileIdle: true } }; }) }).then(function () { return items.length; });
      });
    };
    root.Native.exact = {
      check: function () { return L.checkExactNotificationSetting ? L.checkExactNotificationSetting().then(function (r) { return r && r.exact_alarm === 'granted'; }).catch(function () { return true; }) : Promise.resolve(true); },
      open: function () { return L.changeExactNotificationSetting ? L.changeExactNotificationSetting().catch(function () { }) : Promise.resolve(); }
    };
    try { L.addListener('localNotificationActionPerformed', function (a) { var g = a && a.notification && a.notification.extra && a.notification.extra.go; if (g) { root.__aobGo = g; root.dispatchEvent(new CustomEvent('aob-go', { detail: g })); } }); } catch (e) { }
  }

  // ---------- 푸시 알림 (구글 Firebase · 회사에서 보내는 소식: 보장분석 결과·캠페인·새 버전) ----------
  var PN = plug('PushNotifications');
  if (PN) {
    root.Native.pushRegister = function () {
      return new Promise(function (res) {
        var done = 0, fin = function (v) { if (!done) { done = 1; res(v || ''); } };
        try { PN.addListener('registration', function (t) { fin(t && t.value); }); PN.addListener('registrationError', function () { fin(''); }); } catch (e) { return fin(''); }
        try { PN.createChannel({ id: 'aob9', name: 'AOB9 알림', description: '보장분석 결과 · 캠페인 · 새 버전', importance: 4, visibility: 1 }).catch(function () { }); } catch (e) { }
        PN.requestPermissions().then(function (p) { if (!p || p.receive !== 'granted') return fin(''); return PN.register().catch(function () { fin(''); }); }).catch(function () { fin(''); });
        setTimeout(function () { fin(''); }, 20000);
      });
    };
    try {
      PN.addListener('pushNotificationActionPerformed', function (a) { var g = a && a.notification && a.notification.data && a.notification.data.go; if (g) { root.__aobGo = g; root.dispatchEvent(new CustomEvent('aob-go', { detail: g })); } });
      // 앱을 보고 있을 때 온 푸시도 위에 띄움
      PN.addListener('pushNotificationReceived', function (n) { if (!L) return; L.schedule({ notifications: [{ id: 96000 + (Date.now() % 900), title: n.title || 'AOB9', body: n.body || '', smallIcon: 'ic_stat_aob', iconColor: '#3B6BFF', extra: { go: (n.data && n.data.go) || '' } }] }).catch(function () { }); });
    } catch (e) { }
  }

  // ---------- 공유 · 파일 저장 ----------
  var SH = plug('Share'), FS = plug('Filesystem');
  function b64(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  function safe(n) { return String(n || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120); }
  async function toCache(blob, name) { var w = await FS.writeFile({ path: safe(name), data: await b64(blob), directory: 'CACHE' }); return w.uri; }
  // 파일 저장: 휴대폰 '다운로드'가 아니라 공유 창으로 (카톡·드라이브·내 파일에 저장 고르기)
  async function saveBlob(blob, name) {
    try {
      var uri = await toCache(blob, name);
      try { await FS.writeFile({ path: 'AOB9/' + safe(name), data: await b64(blob), directory: 'DOCUMENTS', recursive: true }); } catch (e) { }
      await SH.share({ title: name, files: [uri], dialogTitle: '저장하거나 보낼 곳 고르기' });
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) console.warn('save', e); }
  }
  root.Native.saveBlob = saveBlob;
  if (SH) {
    navigator.canShare = function (d) { return !!d; };
    navigator.share = async function (d) {
      d = d || {};
      var o = { title: d.title || '', text: d.text || '', dialogTitle: '보낼 곳 고르기' };
      if (d.url) o.url = d.url;
      if (d.files && d.files.length && FS) { o.files = []; for (var i = 0; i < d.files.length; i++) o.files.push(await toCache(d.files[i], d.files[i].name || ('file' + i))); }
      try { await SH.share(o); } catch (e) { var er = new Error(String(e && e.message || e)); er.name = /cancel/i.test(er.message) ? 'AbortError' : 'Error'; throw er; }
    };
  }
  // <a download> 클릭(내려받기)을 가로채서 저장
  if (FS && SH) document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[download]'); if (!a) return;
    var href = a.getAttribute('href') || ''; if (!/^(blob:|data:)/.test(href)) return;
    e.preventDefault(); fetch(href).then(function (r) { return r.blob(); }).then(function (b) { return saveBlob(b, a.getAttribute('download') || 'file'); }).catch(function () { });
  }, true);

  // ---------- 다른 앱에서 공유받은 파일 (보장분석 PDF 등) ----------
  function pullShared() {
    if (!N) return;
    N.takeShared().then(function (r) {
      var fs = ((r && r.files) || []).map(function (f) { if (f.text != null) return new File([f.text], f.name || 'shared.txt', { type: 'text/plain' }); var bin = atob(f.b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], f.name || 'shared', { type: f.mime || '' }); });
      if (fs.length) { root.__sharedFiles = (root.__sharedFiles || []).concat(fs); document.dispatchEvent(new CustomEvent('native-shared', { detail: fs })); }
    }).catch(function () { });
  }
  if (N) { N.addListener('shared', pullShared); document.addEventListener('DOMContentLoaded', function () { setTimeout(pullShared, 1500); }); }

  // 뒤로가기 버튼은 앱 기본 동작(화면 기록 뒤로)을 그대로 씀 → 기존 '창 닫기 → 목록 → 두 번 누르면 종료'와 같음
})(this);
