package io.github.sicrics27gif.oc9;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * AOB9 화면에서 보험사 영업 앱(메리츠 영업지원 모바일, KB스마트비서 등)을 바로 여는 통로.
 * 크롬은 다른 앱의 첫 화면을 직접 못 열기 때문에, 웹 화면 → aob9app://open?pkg=… → 이 화면 → 해당 앱 실행.
 * 아무 웹페이지나 아무 앱을 열지 못하도록 허용 목록에 있는 앱만 엽니다.
 */
public class OpenAppActivity extends Activity {
    private static final Set<String> ALLOWED = new HashSet<>(Arrays.asList(
            "kr.co.meritzfire_sag", "kr.co.meritzfire.meritzoneplus", "kr.co.meritzfire_mof",
            "com.kbinsure.KBSmart",
            "com.skt.tmap.ku", "com.nhn.android.nmap", "net.daum.android.map"));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri u = getIntent() != null ? getIntent().getData() : null;
        String pkg = u != null ? u.getQueryParameter("pkg") : null;
        if (pkg != null && ALLOWED.contains(pkg)) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
            try {
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(launch);
                } else {
                    Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
                    store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(store);
                    Toast.makeText(this, "앱이 설치되어 있지 않아 설치 화면을 엽니다", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Toast.makeText(this, "앱을 열지 못했습니다", Toast.LENGTH_SHORT).show();
            }
        }
        finish();
    }
}
