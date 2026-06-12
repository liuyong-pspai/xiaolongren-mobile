package com.pspai.xiaolongren;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import com.pspai.xiaolongren.BuildConfig;

public class MainActivity extends android.app.Activity {
    private WebView wv;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        wv = new WebView(this);
        setContentView(wv);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString("Xiaolongren/" + BuildConfig.VERSION_NAME);
        wv.setWebViewClient(new WebViewClient());
        wv.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        wv.loadUrl("file:///android_asset/public/mobile.html");
    }

    private class AndroidBridge {
        @JavascriptInterface
        public String getDeviceInfo() {
            return android.os.Build.MODEL + " (" + android.os.Build.VERSION.RELEASE + ")";
        }
    }

    @Override
    public void onBackPressed() {
        if (wv != null && wv.canGoBack()) { wv.goBack(); }
        else { super.onBackPressed(); }
    }
}
