package com.nilawarlabs.nilxdrive;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native host for the offline Nilx Drive WebGL application.
 *
 * All game files are served from the virtual HTTPS origin below. The WebView
 * never loads remote content and cannot access file:// URLs.
 */
public final class MainActivity extends Activity {

    private static final String TAG = "NilxDrive";
    private static final String ASSET_HOST = "androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/assets/www/index.html";

    private static final String RELEASES_API_URL =
            "https://api.github.com/repos/nilawarvaibhav16-ai/nilx-drive/releases/latest";
    private static final String RELEASES_LATEST_URL =
            "https://github.com/nilawarvaibhav16-ai/nilx-drive/releases/latest";
    private static final String RELEASES_PATH_PREFIX =
            "/nilawarvaibhav16-ai/nilx-drive/releases/";
    private static final String UPDATE_PREFS = "nilx_update";
    private static final String KEY_LAST_CHECK = "last_check";
    private static final long UPDATE_CHECK_INTERVAL_MS = 15L * 60L * 1000L;
    private static final int MAX_RELEASE_NOTES = 3200;

    @Nullable
    private WebView webView;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean updateCheckRunning;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.rgb(5, 8, 12));

        WebView view = new WebView(this);
        webView = view;
        view.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        view.setBackgroundColor(Color.rgb(5, 8, 12));
        view.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setLongClickable(false);
        view.setHapticFeedbackEnabled(false);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDefaultTextEncodingName("utf-8");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(ASSET_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        view.addJavascriptInterface(new LocalBridge(), "NilxHost");

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                    @NonNull WebView clientView,
                    @NonNull WebResourceRequest request) {
                return !ASSET_HOST.equals(request.getUrl().getHost());
            }

            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    @NonNull WebView clientView,
                    @NonNull WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(@NonNull WebView clientView, @NonNull String url) {
                super.onPageFinished(clientView, url);
                hideSystemUi();
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(@NonNull ConsoleMessage message) {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, message.message()
                            + " @" + message.sourceId() + ":" + message.lineNumber());
                }
                return true;
            }
        });

        root.addView(view);
        setContentView(root);

        // Insets controller requires the decor view, which only exists after
        // setContentView(). Calling this in onCreate() any earlier crashes on API 30+.
        hideSystemUi();

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        view.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            webView.requestFocus();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.NilxDrive&&window.NilxDrive.hostPause?window.NilxDrive.hostPause():null",
                    null);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return !!(window.NilxDrive&&window.NilxDrive.handleAndroidBack&&window.NilxDrive.handleAndroidBack());}catch(e){return false;}})()",
                handled -> {
                    if (!"true".equals(handled)) {
                        MainActivity.this.finish();
                    }
                });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("NilxHost");
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        updateExecutor.shutdownNow();
        super.onDestroy();
    }

    private void hideSystemUi() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            //noinspection deprecation
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private void requestUpdateCheck(boolean force) {
        if (webView == null || updateCheckRunning) return;

        SharedPreferences prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long lastCheck = prefs.getLong(KEY_LAST_CHECK, 0L);
        if (!force && now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;

        updateCheckRunning = true;
        deliverStatus("checking", null, null);
        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(RELEASES_API_URL).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "NilxDrive/" + BuildConfig.VERSION_NAME);

                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    if (BuildConfig.DEBUG) Log.d(TAG, "Update check skipped, HTTP " + status);
                    deliverStatus("error", null, "GitHub returned HTTP " + status + ".");
                    return;
                }

                String body;
                try (InputStream stream = connection.getInputStream();
                     BufferedReader reader = new BufferedReader(
                             new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    StringBuilder builder = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        builder.append(line).append('\n');
                    }
                    body = builder.toString();
                }

                JSONObject release = new JSONObject(body);
                String tag = release.optString("tag_name", "").trim();
                String latestVersion = normalizeVersion(tag);
                if (latestVersion.isEmpty()) {
                    deliverStatus("error", null, "The latest GitHub release has no version tag.");
                    return;
                }

                prefs.edit().putLong(KEY_LAST_CHECK, now).apply();

                if (!isNewerVersion(latestVersion, BuildConfig.VERSION_NAME)) {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Update check: up to date (latest " + latestVersion + ")");
                    }
                    deliverStatus("up-to-date", latestVersion, null);
                    return;
                }

                String releaseUrl = release.optString("html_url", "").trim();
                if (!isAllowedReleaseUrl(releaseUrl)) releaseUrl = RELEASES_LATEST_URL;

                JSONObject payload = new JSONObject();
                payload.put("version", latestVersion);
                payload.put("tag", tag);
                payload.put("name", release.optString("name", tag));
                payload.put("notes", truncate(release.optString("body", "").trim(), MAX_RELEASE_NOTES));
                payload.put("url", releaseUrl);

                if (BuildConfig.DEBUG) Log.d(TAG, "Update available: " + latestVersion);
                deliverUpdate(payload.toString());
            } catch (Exception error) {
                if (BuildConfig.DEBUG) Log.d(TAG, "Update check failed", error);
                deliverStatus("error", null, "The release feed could not be reached.");
            } finally {
                if (connection != null) connection.disconnect();
                updateCheckRunning = false;
            }
        });
    }

    private void deliverStatus(String state, @Nullable String version, @Nullable String message) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("state", state);
            if (version != null) payload.put("version", version);
            if (message != null) payload.put("message", message);
            String safeJson = payload.toString()
                    .replace("\u2028", "\\u2028")
                    .replace("\u2029", "\\u2029");
            runOnUiThread(() -> {
                WebView view = webView;
                if (view == null) return;
                view.evaluateJavascript(
                        "window.NilxDrive&&window.NilxDrive.updateStatus"
                                + "?window.NilxDrive.updateStatus(" + safeJson + "):null",
                        null);
            });
        } catch (Exception error) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Update status unavailable", error);
        }
    }

    private void deliverUpdate(String payloadJson) {
        String safeJson = payloadJson
                .replace("\u2028", "\\u2028")
                .replace("\u2029", "\\u2029");
        runOnUiThread(() -> {
            WebView view = webView;
            if (view == null) return;
            view.evaluateJavascript(
                    "window.NilxDrive&&window.NilxDrive.showUpdate"
                            + "?window.NilxDrive.showUpdate(" + safeJson + "):null",
                    null);
        });
    }

    private static String normalizeVersion(String tag) {
        String value = tag == null ? "" : tag.trim();
        if (value.startsWith("v") || value.startsWith("V")) {
            value = value.substring(1);
        }
        return value;
    }

    private static boolean isNewerVersion(String candidate, String current) {
        int[] candidateParts = versionParts(candidate);
        int[] currentParts = versionParts(current);
        for (int index = 0; index < candidateParts.length; index++) {
            if (candidateParts[index] != currentParts[index]) {
                return candidateParts[index] > currentParts[index];
            }
        }
        return false;
    }

    private static int[] versionParts(String version) {
        int[] parts = new int[3];
        if (version == null) return parts;

        String[] tokens = version.split("[^0-9]+");
        int index = 0;
        for (String token : tokens) {
            if (token.isEmpty()) continue;
            try {
                int number = Integer.parseInt(token);
                parts[index++] = number;
            } catch (NumberFormatException ignored) {
                // Ignore malformed segments and keep looking at the rest.
            }
            if (index == parts.length) break;
        }
        return parts;
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return "";
        if (value.length() <= maxLength) return value;
        return value.substring(0, maxLength).trim() + "\n…";
    }

    private static boolean isAllowedReleaseUrl(@Nullable String rawUrl) {
        if (rawUrl == null) return false;
        Uri uri = Uri.parse(rawUrl);
        String path = uri.getPath();
        return "https".equalsIgnoreCase(uri.getScheme())
                && "github.com".equalsIgnoreCase(uri.getHost())
                && path != null
                && path.startsWith(RELEASES_PATH_PREFIX);
    }

    private final class LocalBridge {
        @JavascriptInterface
        public void exitGame() {
            runOnUiThread(() -> finish());
        }

        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(() -> requestUpdateCheck(false));
        }

        @JavascriptInterface
        public void checkForUpdatesNow() {
            runOnUiThread(() -> requestUpdateCheck(true));
        }

        @JavascriptInterface
        public String getVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public int getVersionCode() {
            return BuildConfig.VERSION_CODE;
        }

        @SuppressWarnings("deprecation")
        @JavascriptInterface
        public void vibrate(int milliseconds) {
            int duration = Math.max(10, Math.min(120, milliseconds));
            runOnUiThread(() -> {
                try {
                    Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    if (vibrator == null || !vibrator.hasVibrator()) return;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createOneShot(
                                duration, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        vibrator.vibrate(duration);
                    }
                } catch (Exception error) {
                    if (BuildConfig.DEBUG) Log.d(TAG, "Vibration unavailable", error);
                }
            });
        }

        @JavascriptInterface
        public void openReleasePage(String url) {
            if (!isAllowedReleaseUrl(url)) {
                if (BuildConfig.DEBUG) Log.w(TAG, "Blocked release URL: " + url);
                return;
            }
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(intent);
                } catch (ActivityNotFoundException error) {
                    Log.w(TAG, "No browser is available for the release page.", error);
                }
            });
        }
    }
}
