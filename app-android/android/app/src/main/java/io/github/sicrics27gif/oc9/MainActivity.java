package io.github.sicrics27gif.oc9;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AobNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
