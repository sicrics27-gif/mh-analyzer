package io.github.sicrics27gif.oc9;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;

/** 구글 권한 허락 화면(PendingIntent)을 띄우고 결과를 그대로 돌려주는 투명 화면 */
public class AuthResolveActivity extends Activity {
    private static final int REQ = 7301;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (b != null) return;
        PendingIntent pi = getIntent().getParcelableExtra("pi");
        if (pi == null) { setResult(RESULT_CANCELED); finish(); return; }
        try {
            startIntentSenderForResult(pi.getIntentSender(), REQ, null, 0, 0, 0);
        } catch (Exception e) {
            setResult(RESULT_CANCELED); finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        setResult(resultCode, data);
        finish();
    }
}
