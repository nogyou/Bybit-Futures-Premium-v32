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
import android.content.Intent;
import android.net.Uri;
import android.util.Xml;
import org.xmlpull.v1.XmlPullParser;
import org.json.JSONArray;
import java.io.StringReader;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Collections;
import java.util.List;
import java.util.ArrayList;
import java.net.URLEncoder;

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
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest req) {
                Uri uri = req.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                if (req.isForMainFrame() && newsLinkAllowed(uri.toString())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true; // news sites must never run inside the bridge-enabled WebView
            }
        });
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
        // This WebView's file:// UI cannot reliably fetch cross-domain RSS (CORS),
        // so the native layer fetches a fixed allowlist of PUBLIC news feeds only.
        @JavascriptInterface public void requestNews(String id) {
            if (id == null || !id.matches("^[a-zA-Z0-9_-]{1,64}$")) return;
            pool.execute(() -> {
                try {
                    List<JSONObject> articles = new ArrayList<>();
                    String lastError = null;
                    String[] feeds;
                    try {
                        String korean = "https://news.google.com/rss/search?q=" +
                            URLEncoder.encode("비트코인 when:1d", "UTF-8") + "&hl=ko&gl=KR&ceid=KR:ko";
                        feeds = new String[] { korean, "https://cointelegraph.com/rss/tag/bitcoin" };
                    } catch (Exception ex) { throw new Exception("뉴스 검색어 변환 실패"); }
                    String[] sources = { "Google 뉴스 · 한국", "Cointelegraph" };
                    for (int i = 0; i < feeds.length; i++) {
                        try { articles.addAll(readRss(feeds[i], sources[i])); }
                        catch (Exception ex) { lastError = ex.getMessage(); }
                    }
                    if (articles.isEmpty()) {
                        deliverNews(id, "", "뉴스 조회 실패: " + (lastError == null ? "새 기사 없음" : lastError));
                        return;
                    }
                    Collections.sort(articles, (a,b) -> Long.compare(b.optLong("publishedAt"), a.optLong("publishedAt")));
                    JSONArray result = new JSONArray();
                    java.util.HashSet<String> used = new java.util.HashSet<>();
                    for (JSONObject item : articles) {
                        String title = item.optString("title").trim();
                        if (title.isEmpty() || !used.add(title.toLowerCase(Locale.ROOT))) continue;
                        result.put(item);
                        if (result.length() >= 30) break;
                    }
                    deliverNews(id, result.toString(), null);
                } catch (Exception ex) { deliverNews(id, "", ex.getMessage()); }
            });
        }
        @JavascriptInterface public void openNews(String url) {
            if (!newsLinkAllowed(url)) return;
            ui.post(() -> {
                try {startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));}
                catch (Exception ignored) { /* browser unavailable */ }
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


    private static boolean newsLinkAllowed(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost();
            return "https".equalsIgnoreCase(u.getScheme()) &&
                ("news.google.com".equalsIgnoreCase(host) || "cointelegraph.com".equalsIgnoreCase(host));
        } catch (Exception ex) { return false; }
    }

    private static String fetchRss(String address) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(8500);
        c.setReadTimeout(9500);
        c.setRequestMethod("GET");
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (compatible; BybitTradeTerminal/3.2.2 RSS Reader)");
        c.setRequestProperty("Accept", "application/rss+xml,application/xml,text/xml,*/*");
        try {
            if (c.getResponseCode() != 200) throw new Exception("뉴스 서버 HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192]; int n;
                while ((n=in.read(buf)) != -1) {
                    out.write(buf,0,n);
                    if (out.size()>1_500_000) throw new Exception("RSS 응답 크기 초과");
                }
                return out.toString("UTF-8");
            }
        } finally { c.disconnect(); }
    }

    private static long parseNewsDate(String text) {
        if (text == null || text.isEmpty()) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US);
            f.setLenient(true);
            Date date=f.parse(text);
            return date==null?0:date.getTime();
        } catch (Exception ignored) {
            try {
                Date d=new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz",Locale.US).parse(text);
                return d==null?0:d.getTime();
            } catch(Exception ignoredAgain) { return 0; }
        }
    }

    // XML pull parser reads only item metadata. Raw article HTML is never displayed.
    private static List<JSONObject> readRss(String feedUrl, String publisher) throws Exception {
        String xml=fetchRss(feedUrl);
        XmlPullParser p=Xml.newPullParser();
        p.setInput(new StringReader(xml));
        List<JSONObject> out=new ArrayList<>();
        boolean item=false;String field=null;String title="",link="",source=publisher,date="";
        StringBuilder text=new StringBuilder();
        int evt=p.getEventType();
        while (evt != XmlPullParser.END_DOCUMENT && out.size() < 35) {
            if (evt==XmlPullParser.START_TAG) {
                String tag=p.getName();
                if ("item".equalsIgnoreCase(tag)) {
                    item=true;title="";link="";source=publisher;date="";field=null;
                } else if(item && ("title".equalsIgnoreCase(tag) || "link".equalsIgnoreCase(tag)
                    || "pubDate".equalsIgnoreCase(tag) || "source".equalsIgnoreCase(tag))) {
                    field=tag; text.setLength(0);
                }
            } else if (evt==XmlPullParser.TEXT || evt==XmlPullParser.CDSECT) {
                if (item && field!=null && text.length()<1024) text.append(p.getText());
            } else if(evt==XmlPullParser.END_TAG) {
                String tag=p.getName();
                if (item && field!=null && field.equalsIgnoreCase(tag)) {
                    String value=text.toString().trim();
                    if("title".equalsIgnoreCase(field))title=value;
                    else if("link".equalsIgnoreCase(field))link=value;
                    else if("source".equalsIgnoreCase(field)&&!value.isEmpty())source=value;
                    else if("pubDate".equalsIgnoreCase(field))date=value;
                    field=null;
                }
                if("item".equalsIgnoreCase(tag)&&item){
                    item=false;field=null;
                    if(title.length()>3 && title.length()<650 && newsLinkAllowed(link)) {
                        JSONObject n=new JSONObject();
                        n.put("title",title);n.put("url",link);
                        n.put("source",source);n.put("publishedAt",parseNewsDate(date));
                        out.add(n);
                    }
                }
            }
            evt=p.next();
        }
        return out;
    }

    private void deliverNews(String id,String data,String error) {
        ui.post(() -> {
            if (web == null) return;
            String js="window.__receiveNews && window.__receiveNews(" +
              JSONObject.quote(id==null?"":id) + "," +
              JSONObject.quote(data==null?"":data) + "," +
              JSONObject.quote(error==null?"":error) + ")";
            web.evaluateJavascript(js,null);
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
