package io.github.sicrics27gif.oc9;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * 다른 앱(카톡 등)에서 '공유 → AOB9' 하거나 aob9app:// 주소로 들어올 때 잠깐 거쳐 가는 투명 화면.
 * 공유 파일은 여기서 바로 읽어 두고(권한이 살아 있을 때), AOB9 본 화면은 '평범한 실행'으로 연다.
 * → 최근 앱 목록에서 다시 눌러도 만료된 공유 권한 때문에 "앱을 열지 못했어요"가 나지 않음.
 */
public class ShareActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent it = getIntent();
        boolean got = false;
        try {
            if (it != null && "aob9app".equalsIgnoreCase(it.getScheme())) {
                Uri u = it.getData(); String pkg = u == null ? null : u.getQueryParameter("pkg");
                if (pkg != null && AobNativePlugin.APPS.contains(pkg)) {
                    Intent l = getPackageManager().getLaunchIntentForPackage(pkg);
                    if (l == null) l = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
                    l.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(l);
                    finish(); return;
                }
            } else {
                got = AobNativePlugin.readShareStatic(getApplicationContext(), it);
            }
        } catch (Exception ignored) { }
        Intent m = new Intent(this, MainActivity.class);
        m.setAction(Intent.ACTION_MAIN); m.addCategory(Intent.CATEGORY_LAUNCHER);
        m.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        if (got) m.putExtra("aob_shared", true);
        startActivity(m);
        finish();
    }
}
