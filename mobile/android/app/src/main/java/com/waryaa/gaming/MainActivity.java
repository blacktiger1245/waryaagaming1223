package com.waryaa.gaming;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the native MediaProjection screen-capture plugin so the
        // web page inside the WebView can call Capacitor.Plugins.ScreenCast.
        registerPlugin(ScreenCastPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
