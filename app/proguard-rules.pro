# Nilx Drive keeps its JavaScript bridge reachable from the local WebView page.
-keepclassmembers class com.nilawarlabs.nilxdrive.MainActivity {
    @android.webkit.JavascriptInterface <methods>;
}
