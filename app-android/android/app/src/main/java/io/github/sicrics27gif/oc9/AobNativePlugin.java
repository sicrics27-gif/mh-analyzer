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
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO })
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
                it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500);
                it.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000);
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
}
