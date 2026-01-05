package ru.privetsuper.manager;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String REMOTE_URL = "https://manager.privetsuper.ru/";
    private static final String OFFLINE_URL = "file:///android_asset/public/offline.html";
    private static final String MAINTENANCE_URL = "file:///android_asset/public/maintenance.html";
    private static final String RETRY_SCHEME = "app";
    private static final String RETRY_HOST = "retry";

    private boolean showingFallback = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupWebViewFallbacks();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (showingFallback && isNetworkAvailable()) {
            loadRemote();
        }
    }

    private void setupWebViewFallbacks() {
        WebView webView = getBridge().getWebView();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (RETRY_SCHEME.equals(url.getScheme()) && RETRY_HOST.equals(url.getHost())) {
                    loadRemote();
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && url.startsWith(RETRY_SCHEME + "://" + RETRY_HOST)) {
                    loadRemote();
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (REMOTE_URL.equals(url)) {
                    showingFallback = false;
                }
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    showOffline();
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                showOffline();
                super.onReceivedError(view, errorCode, description, failingUrl);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame() && errorResponse != null) {
                    int statusCode = errorResponse.getStatusCode();
                    if (statusCode >= 500) {
                        showMaintenance();
                    }
                }
                super.onReceivedHttpError(view, request, errorResponse);
            }
        });
    }

    private void loadRemote() {
        showingFallback = false;
        getBridge().getWebView().loadUrl(REMOTE_URL);
    }

    private void showOffline() {
        if (showingFallback) {
            return;
        }
        showingFallback = true;
        getBridge().getWebView().loadUrl(OFFLINE_URL);
    }

    private void showMaintenance() {
        if (showingFallback) {
            return;
        }
        showingFallback = true;
        getBridge().getWebView().loadUrl(MAINTENANCE_URL);
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            return false;
        }
        NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }
}
