package io.github.sicrics27gif.oc9;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * AOB9 앱 전용 기능: 다른 앱 열기, 구글 로그인(앱 방식), 음성 인식, 공유받은 파일.
 * 고객 정보는 여기서 어디로도 보내지 않습니다 (로그인 토큰과 파일은 앱 화면으로만 전달).
 */
@CapacitorPlugin(name = "AobNative", permissions = {
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "noti", strings = { "android.permission.POST_NOTIFICATIONS" })
})
public class AobNativePlugin extends Plugin {
    // 다른 웹페이지가 아무 앱이나 열지 못하도록 허용 목록만
    private static final Set<String> APPS = new HashSet<>(Arrays.asList(
            "kr.co.meritzfire_sag", "kr.co.meritzfire.meritzoneplus", "kr.co.meritzfire_mof",
            "com.kbinsure.KBSmart", "com.skt.tmap.ku", "com.nhn.android.nmap", "net.daum.android.map",
            "com.kakao.talk", "com.google.android.apps.maps"));

    private SpeechRecognizer sr;
    private final List<JSObject> shared = new ArrayList<>();

    @Override
    public void load() {
        Activity a = getActivity();
        if (a != null) readShare(a.getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (readShare(intent)) notifyListeners("shared", new JSObject());
    }

    /** 화면에서 tel:, sms:, intent://, tmap:// 같은 주소로 이동하면 휴대폰 앱으로 열기 */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String sc = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
        if (sc.equals("http") || sc.equals("https") || sc.equals("data") || sc.equals("blob") || sc.equals("about") || sc.equals("javascript")) return null;
        Activity a = getActivity();
        try {
            if (sc.equals("aob9app")) {
                String pkg = url.getQueryParameter("pkg");
                if (pkg != null && APPS.contains(pkg)) {
                    Intent it = a.getPackageManager().getLaunchIntentForPackage(pkg);
                    if (it == null) it = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(it);
                }
                return true;
            }
            if (sc.equals("intent")) {
                Intent it = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
                // 예전 앱 방식 주소(aob9app://open?pkg=...)도 그대로 처리
                if ("aob9app".equals(it.getScheme()) && it.getData() != null) return shouldOverrideLoad(it.getData());
                it.addCategory(Intent.CATEGORY_BROWSABLE); it.setComponent(null); it.setSelector(null);
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { a.startActivity(it); }
                catch (ActivityNotFoundException e) {
                    String fb = it.getStringExtra("browser_fallback_url");
                    String pkg = it.getPackage();
                    if (fb != null) a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fb)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    else if (pkg != null) a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                }
                return true;
            }
            Intent it;
            if (sc.equals("sms") || sc.equals("smsto")) {
                String ssp = url.getEncodedSchemeSpecificPart() == null ? "" : url.getEncodedSchemeSpecificPart();
                int q = ssp.indexOf('?'); String num = q >= 0 ? ssp.substring(0, q) : ssp; String body = null;
                if (q >= 0) { for (String kv : ssp.substring(q + 1).split("&")) if (kv.startsWith("body=")) body = Uri.decode(kv.substring(5).replace("+", "%20")); }
                it = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(Uri.decode(num))));
                if (body != null) it.putExtra("sms_body", body);
            } else it = new Intent(sc.equals("tel") ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, url);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(it);
        } catch (Exception e) {
            JSObject o = new JSObject(); o.put("url", url.toString()); notifyListeners("openFail", o);
        }
        return true;
    }

    // ---------- 다른 앱 열기 ----------
    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("pkg", "");
        if (!APPS.contains(pkg)) { call.reject("허용되지 않은 앱"); return; }
        Activity a = getActivity();
        Intent it = a.getPackageManager().getLaunchIntentForPackage(pkg);
        JSObject r = new JSObject();
        try {
            if (it != null) { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(it); r.put("opened", true); }
            else { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); r.put("opened", false); r.put("store", true); }
            call.resolve(r);
        } catch (Exception e) { call.reject("앱을 열지 못했습니다"); }
    }

    /** tel:, sms:, tmap://, nmap://, intent:// 같은 주소를 휴대폰 앱으로 열기 (없으면 설치 화면) */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        String pkg = call.getString("pkg", "");
        Activity a = getActivity();
        try {
            Intent it = url.startsWith("intent:") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            it.addCategory(Intent.CATEGORY_BROWSABLE);
            it.setComponent(null); it.setSelector(null);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(it);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            if (pkg.length() > 0) {
                try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); call.resolve(); return; } catch (Exception ignored) { }
            }
            call.reject("이 휴대폰에 해당 앱이 없습니다");
        } catch (Exception e) { call.reject("열지 못했습니다: " + e.getMessage()); }
    }

    // ---------- 구글 로그인 (앱 방식 · 한 번 허락하면 다음부터 화면 없이 토큰) ----------
    @PluginMethod
    public void gAuth(PluginCall call) {
        JSArray arr = call.getArray("scopes", new JSArray());
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        List<Scope> scopes = new ArrayList<>();
        try { for (int i = 0; i < arr.length(); i++) scopes.add(new Scope(arr.getString(i))); } catch (Exception e) { call.reject("scopes"); return; }
        AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(scopes).build();
        Identity.getAuthorizationClient(getActivity()).authorize(req)
                .addOnSuccessListener(res -> {
                    if (res.hasResolution()) {
                        if (!interactive) { call.reject("NEED_LOGIN", "NEED_LOGIN"); return; }
                        Intent it = new Intent(getContext(), AuthResolveActivity.class);
                        it.putExtra("pi", res.getPendingIntent());
                        startActivityForResult(call, it, "gAuthDone");
                    } else call.resolve(tokenObj(res));
                })
                .addOnFailureListener(e -> {
                    int code = (e instanceof ApiException) ? ((ApiException) e).getStatusCode() : -1;
                    call.reject(code == 10 ? "DEVELOPER_ERROR" : ("구글 로그인 오류 " + code + ": " + e.getMessage()), code == 10 ? "DEVELOPER_ERROR" : "AUTH_FAIL");
                });
    }

    @ActivityCallback
    private void gAuthDone(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.reject("로그인을 취소했습니다", "CANCELED"); return; }
        try {
            AuthorizationResult res = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(result.getData());
            call.resolve(tokenObj(res));
        } catch (ApiException e) { call.reject("구글 로그인 오류 " + e.getStatusCode(), "AUTH_FAIL"); }
    }

    private JSObject tokenObj(AuthorizationResult res) {
        JSObject o = new JSObject();
        o.put("accessToken", res.getAccessToken());
        JSArray g = new JSArray();
        for (String s : res.getGrantedScopes()) g.put(s);
        o.put("scopes", g);
        return o;
    }

    // ---------- 음성 인식 (말하는 동안 글자를 계속 보냄) ----------
    @PluginMethod
    public void speechStart(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "micDone"); return; }
        startListen(call);
    }

    @PermissionCallback
    private void micDone(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) startListen(call);
        else call.reject("마이크 권한이 없습니다", "not-allowed");
    }

    private void startListen(PluginCall call) {
        final String lang = call.getString("lang", "ko-KR");
        getActivity().runOnUiThread(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) { call.reject("이 휴대폰은 음성 인식을 지원하지 않습니다", "unavailable"); return; }
                if (sr != null) { sr.destroy(); sr = null; }
                sr = SpeechRecognizer.createSpeechRecognizer(getContext());
                sr.setRecognitionListener(new RecognitionListener() {
                    public void onReadyForSpeech(Bundle p) { }
                    public void onBeginningOfSpeech() { }
                    public void onRmsChanged(float v) { }
                    public void onBufferReceived(byte[] b) { }
                    public void onEndOfSpeech() { }
                    public void onEvent(int t, Bundle p) { }
                    public void onError(int err) { JSObject o = new JSObject(); o.put("code", err); notifyListeners("speechEnd", o); }
                    public void onPartialResults(Bundle r) { emit(r, false); }
                    public void onResults(Bundle r) { emit(r, true); JSObject o = new JSObject(); o.put("code", 0); notifyListeners("speechEnd", o); }
                });
                Intent it = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                it.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                it.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                it.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                it.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 650);
                it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 450);
                sr.startListening(it);
                call.resolve();
            } catch (Exception e) { call.reject("음성 인식을 시작하지 못했습니다: " + e.getMessage()); }
        });
    }

    private void emit(Bundle r, boolean fin) {
        ArrayList<String> m = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (m == null || m.isEmpty()) return;
        JSObject o = new JSObject(); o.put("text", m.get(0)); o.put("final", fin);
        notifyListeners("speech", o);
    }

    @PluginMethod
    public void speechStop(PluginCall call) {
        getActivity().runOnUiThread(() -> { try { if (sr != null) { sr.cancel(); sr.destroy(); sr = null; } } catch (Exception ignored) { } call.resolve(); });
    }

    // ---------- 다른 앱에서 공유한 파일 (보장분석 PDF 등) ----------
    private boolean readShare(Intent it) {
        if (it == null) return false;
        String act = it.getAction();
        if (!Intent.ACTION_SEND.equals(act) && !Intent.ACTION_SEND_MULTIPLE.equals(act)) return false;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(act)) { Uri u = it.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) uris.add(u); }
        else { ArrayList<Uri> l = it.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (l != null) uris.addAll(l); }
        ContentResolver cr = getContext().getContentResolver();
        for (Uri u : uris) {
            if (shared.size() >= 10) break;
            try (InputStream in = cr.openInputStream(u)) {
                if (in == null) continue;
                ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n, tot = 0;
                while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); tot += n; if (tot > 40 * 1024 * 1024) break; }
                JSObject o = new JSObject();
                o.put("name", nameOf(cr, u)); o.put("mime", cr.getType(u) == null ? "application/octet-stream" : cr.getType(u));
                o.put("b64", Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                shared.add(o);
            } catch (Exception ignored) { }
        }
        it.setAction(Intent.ACTION_MAIN);
        return !shared.isEmpty();
    }

    private String nameOf(ContentResolver cr, Uri u) {
        try (Cursor c = cr.query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) { int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (i >= 0) return c.getString(i); }
        } catch (Exception ignored) { }
        String p = u.getLastPathSegment(); return p == null ? "shared" : p;
    }

    @PluginMethod
    public void takeShared(PluginCall call) {
        JSArray a = new JSArray(); for (JSObject o : shared) a.put(o); shared.clear();
        JSObject r = new JSObject(); r.put("files", a); call.resolve(r);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try { android.content.pm.PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0); r.put("version", pi.versionName); r.put("code", androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(pi)); } catch (PackageManager.NameNotFoundException ignored) { }
        call.resolve(r);
    }

    // ================= 액션콜: 진짜 전화처럼 (벨소리 · 귀에 대고 듣기 · 귀에 대면 화면 꺼짐) =================
    private Ringtone ring; private Vibrator vib; private MediaPlayer mp; private PluginCall voiceCall; private TextToSpeech tts; private boolean ttsReady = false; private PluginCall sayCall; private PowerManager.WakeLock prox; private boolean callMode = false;

    /** 벨소리: 휴대폰에 설정된 벨소리 + 진동. 무음·진동 모드여도 연습 전화라 미디어 소리로 울림 */
    @PluginMethod
    public void ring(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        Context c = getContext();
        try {
            if (ring != null) { ring.stop(); ring = null; }
            if (vib != null) { vib.cancel(); }
            if (on) {
                Uri u = RingtoneManager.getActualDefaultRingtoneUri(c, RingtoneManager.TYPE_RINGTONE);
                if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                ring = RingtoneManager.getRingtone(c, u);
                AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
                boolean loud = am.getRingerMode() == AudioManager.RINGER_MODE_NORMAL;
                if (ring != null) {
                    ring.setAudioAttributes(new AudioAttributes.Builder().setUsage(loud ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE : AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                    if (Build.VERSION.SDK_INT >= 28) ring.setLooping(true);
                    ring.play();
                }
                vib = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
                if (vib != null && vib.hasVibrator()) {
                    long[] pat = new long[] { 0, 900, 700, 900, 700 };
                    if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, 1)); else vib.vibrate(pat, 1);
                }
            }
            call.resolve();
        } catch (Exception e) { call.reject("벨소리를 울리지 못했습니다: " + e.getMessage()); }
    }

    /** 통화 모드: on=true 면 귀(수화기)로, speaker=true 면 스피커로 */
    @PluginMethod
    public void callAudio(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true)), spk = Boolean.TRUE.equals(call.getBoolean("speaker", false));
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        try {
            callMode = on;
            if (on) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                if (Build.VERSION.SDK_INT >= 31) {
                    AudioDeviceInfo pick = null;
                    for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                        int t = d.getType();
                        if (spk && t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) pick = d;
                        if (!spk && (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_BLE_HEADSET)) { pick = d; break; }
                        if (!spk && pick == null && t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) pick = d;
                    }
                    if (pick != null) am.setCommunicationDevice(pick);
                } else am.setSpeakerphoneOn(spk);
            } else {
                if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice(); else am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
            }
            call.resolve();
        } catch (Exception e) { call.reject("통화 소리 설정 실패: " + e.getMessage()); }
    }

    private AudioAttributes voiceAttr() {
        return new AudioAttributes.Builder().setUsage(callMode ? AudioAttributes.USAGE_VOICE_COMMUNICATION : AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    }

    /** 상대 목소리 재생 (wav·mp3를 base64로) — 통화 모드면 귀로 들림. 다 들으면 끝남 */
    @PluginMethod
    public void playVoice(PluginCall call) {
        String b64 = call.getString("b64", ""), ext = call.getString("ext", "wav");
        stopMp();
        try {
            File f = new File(getContext().getCacheDir(), "voice." + ext);
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(b64, Base64.DEFAULT)); }
            mp = new MediaPlayer();
            mp.setAudioAttributes(voiceAttr());
            mp.setDataSource(f.getAbsolutePath());
            float vol = call.getFloat("vol", 1f);
            mp.setVolume(vol, vol);
            voiceCall = call;
            mp.setOnCompletionListener(m -> { PluginCall c2 = voiceCall; voiceCall = null; stopMp(); if (c2 != null) c2.resolve(); });
            mp.setOnErrorListener((m, a, b) -> { PluginCall c2 = voiceCall; voiceCall = null; stopMp(); if (c2 != null) c2.reject("재생 오류 " + a); return true; });
            mp.prepare();
            mp.start();
        } catch (Exception e) { voiceCall = null; stopMp(); call.reject("재생 실패: " + e.getMessage()); }
    }

    private void stopMp() { try { if (mp != null) { mp.reset(); mp.release(); } } catch (Exception ignored) { } mp = null; }

    @PluginMethod
    public void stopVoice(PluginCall call) {
        PluginCall c2 = voiceCall; voiceCall = null; stopMp(); if (c2 != null) c2.resolve();
        PluginCall s2 = sayCall; sayCall = null; try { if (tts != null) tts.stop(); } catch (Exception ignored) { } if (s2 != null) s2.resolve();
        call.resolve();
    }

    /** 휴대폰 기본 목소리로 읽기 (통화 모드면 귀로) */
    @PluginMethod
    public void say(PluginCall call) {
        final String text = call.getString("text", "");
        final boolean female = Boolean.TRUE.equals(call.getBoolean("female", false));
        final float rate = call.getFloat("rate", 1.05f);
        Runnable go = () -> {
            try {
                tts.setLanguage(Locale.KOREAN);
                Voice best = null;
                try { for (Voice v : tts.getVoices()) { if (v.getLocale() == null || !"ko".equals(v.getLocale().getLanguage()) || v.isNetworkConnectionRequired()) continue; String n = v.getName().toLowerCase(Locale.ROOT); boolean m = n.contains("male") && !n.contains("female"); if (best == null || (female ? n.contains("female") || n.contains("-c-") || n.contains("koa") : m || n.contains("-d-") || n.contains("kod"))) best = v; } } catch (Exception ignored) { }
                if (best != null) tts.setVoice(best);
                tts.setPitch(female ? 1.08f : 0.88f); tts.setSpeechRate(rate);
                tts.setAudioAttributes(voiceAttr());
                PluginCall old = sayCall; sayCall = call; if (old != null) old.resolve();
                Bundle b = new Bundle(); b.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, call.getFloat("vol", 1f));
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, b, "aob" + System.currentTimeMillis());
            } catch (Exception e) { call.reject("읽기 실패: " + e.getMessage()); }
        };
        if (tts != null && ttsReady) { go.run(); return; }
        tts = new TextToSpeech(getContext(), st -> {
            ttsReady = st == TextToSpeech.SUCCESS;
            if (!ttsReady) { call.reject("휴대폰 음성 엔진을 쓸 수 없습니다"); return; }
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                public void onStart(String id) { }
                public void onDone(String id) { PluginCall c2 = sayCall; sayCall = null; if (c2 != null) c2.resolve(); }
                public void onError(String id) { PluginCall c2 = sayCall; sayCall = null; if (c2 != null) c2.resolve(); }
            });
            go.run();
        });
    }

    /** 귀에 대면 화면 꺼짐 (진짜 통화처럼) */
    @PluginMethod
    public void proximity(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        try {
            if (on) {
                if (prox == null) { PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE); if (pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) prox = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "aob9:call"); }
                if (prox != null && !prox.isHeld()) prox.acquire(60 * 60 * 1000L);
            } else if (prox != null && prox.isHeld()) prox.release();
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ================= 자동 동선 기록 =================
    @PluginMethod
    public void trackStart(PluginCall call) {
        if (getPermissionState("loc") != PermissionState.GRANTED) { requestPermissionForAlias("loc", call, "trackPerm"); return; }
        if (android.os.Build.VERSION.SDK_INT >= 33 && getPermissionState("noti") != PermissionState.GRANTED) { requestPermissionForAlias("noti", call, "trackPerm"); return; }
        startTrack(call);
    }

    @PermissionCallback
    private void trackPerm(PluginCall call) {
        if (getPermissionState("loc") != PermissionState.GRANTED) { call.reject("위치 권한이 없습니다", "no-loc"); return; }
        if (android.os.Build.VERSION.SDK_INT >= 33 && getPermissionState("noti") != PermissionState.GRANTED) { requestPermissionForAlias("noti", call, "trackPerm2"); return; }
        startTrack(call);
    }

    @PermissionCallback
    private void trackPerm2(PluginCall call) { startTrack(call); }

    private void startTrack(PluginCall call) {
        try {
            TrackService.prefs(getContext()).edit().putBoolean("on", true).apply();
            Intent it = new Intent(getContext(), TrackService.class);
            if (android.os.Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(it); else getContext().startService(it);
            JSObject r = new JSObject(); r.put("on", true); call.resolve(r);
        } catch (Exception e) { call.reject("동선 기록을 켜지 못했습니다: " + e.getMessage()); }
    }

    @PluginMethod
    public void trackStop(PluginCall call) {
        TrackService.prefs(getContext()).edit().putBoolean("on", false).apply();
        getContext().stopService(new Intent(getContext(), TrackService.class));
        call.resolve();
    }

    /** 앱을 열 때: 켜 두었는데 꺼져 있으면 다시 켬 (휴대폰을 껐다 켠 경우 등) */
    @PluginMethod
    public void trackStatus(PluginCall call) {
        boolean on = TrackService.prefs(getContext()).getBoolean("on", false);
        boolean perm = getPermissionState("loc") == PermissionState.GRANTED;
        if (on && perm && !TrackService.running) { try { Intent it = new Intent(getContext(), TrackService.class); if (android.os.Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(it); else getContext().startService(it); } catch (Exception ignored) { } }
        JSObject r = new JSObject(); r.put("on", on); r.put("running", TrackService.running || (on && perm)); r.put("perm", perm);
        java.io.File f = TrackService.file(getContext()); r.put("bytes", f.exists() ? f.length() : 0);
        try { android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE); r.put("battery", pm.isIgnoringBatteryOptimizations(getContext().getPackageName())); } catch (Exception ignored) { }
        call.resolve(r);
    }

    /** 쌓인 위치를 가져가고 파일은 비움 */
    @PluginMethod
    public void trackTake(PluginCall call) {
        JSArray a = new JSArray();
        synchronized (TrackService.class) {
            java.io.File f = TrackService.file(getContext());
            if (f.exists()) {
                try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.FileReader(f))) {
                    String line; while ((line = br.readLine()) != null) { String[] p = line.split(","); if (p.length < 3) continue; JSArray x = new JSArray(); x.put(Long.parseLong(p[0])); x.put(Double.parseDouble(p[1])); x.put(Double.parseDouble(p[2])); x.put(p.length > 3 ? Integer.parseInt(p[3]) : 0); a.put(x); }
                } catch (Exception ignored) { }
                f.delete();
            }
        }
        JSObject r = new JSObject(); r.put("points", a); call.resolve(r);
    }

    /** 배터리 '제한 없음' 설정 화면 열기 (삼성 휴대폰이 기록을 멈추지 않게) */
    @PluginMethod
    public void openBattery(PluginCall call) {
        try {
            Intent it = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(it); call.resolve();
        } catch (Exception e) {
            try { Intent it2 = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())); it2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(it2); call.resolve(); } catch (Exception e2) { call.reject(e2.getMessage()); }
        }
    }

    @Override
    protected void handleOnDestroy() {
        try { if (ring != null) ring.stop(); if (vib != null) vib.cancel(); stopMp(); if (tts != null) tts.shutdown(); if (prox != null && prox.isHeld()) prox.release(); } catch (Exception ignored) { }
        super.handleOnDestroy();
    }
}
