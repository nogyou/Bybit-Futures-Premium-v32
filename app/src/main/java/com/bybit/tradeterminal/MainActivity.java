package com.bybit.tradeterminal;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.annotation.SuppressLint;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.view.WindowManager;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(3);

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(5894 | 1024 | 512);
        getWindow().setNavigationBarColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(5, 11, 19));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setDefaultTextEncodingName("utf-8");
        s.setBuiltInZoomControls(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new ApiBridge(), "AndroidBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    private class ApiBridge {
        @JavascriptInterface public void request(String id, String endpoint) {
            if (id == null || id.length() > 64 || endpoint == null ||
                !endpoint.matches("^/v5/market/(tickers|kline|orderbook|open-interest|instruments-info)(\\?[a-zA-Z0-9=&%_.-]+)?$")) {
                deliver(id == null ? "bad" : id, "", "허용되지 않은 API 경로");
                return;
            }
            pool.execute(() -> {
                String error = null, data = null;
                String[] bases = { "https://api.bybit.com", "https://api.bytick.com" };
                for (String base : bases) {
                    try {
                        data = fetch(base + endpoint);
                        JSONObject json = new JSONObject(data);
                        if (json.optInt("retCode", -1) != 0) throw new Exception("Bybit API: " + json.optString("retMsg", "Unknown"));
                        error = null;
                        break;
                    } catch (Exception ex) { error = ex.getMessage(); }
                }
                deliver(id, data == null ? "" : data, error);
            });
        }
        @JavascriptInterface public void log(String message) { /* no personal data collected */ }
    }

    private static String fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(12000);
        c.setRequestMethod("GET");
        c.setRequestProperty("User-Agent", "BybitTradeTerminal/3.2 Android");
        c.setRequestProperty("Accept", "application/json");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    if (out.size() > 5_000_000) throw new Exception("응답 크기 초과");
                }
                return out.toString("UTF-8");
            }
        } finally { c.disconnect(); }
    }

    private void deliver(String id, String data, String error) {
        ui.post(() -> {
            if (web != null) {
                String js = "window.__receive(" + JSONObject.quote(id == null ? "" : id) + "," +
                    JSONObject.quote(data == null ? "" : data) + "," +
                    JSONObject.quote(error == null ? "" : error) + ")";
                web.evaluateJavascript(js, null);
            }
        });
    }

    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { pool.shutdownNow(); if (web != null) web.destroy(); super.onDestroy(); }
    @Override public void onBackPressed() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.closeOverlay && window.closeOverlay()", value -> {
            if (!"true".equals(value)) finish();
        });
    }
}
