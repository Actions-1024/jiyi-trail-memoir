package com.jiyi.trailmemoir;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A deliberately small, dependency-light Android shell for the 迹忆 PWA.
 *
 * The web app is served from assets through an intercepted HTTPS origin
 * (https://appassets.local), which gives the WebView a secure context for
 * geolocation, IndexedDB and the canvas MediaRecorder API.
 */
public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/index.html";

    private static final int REQ_PICK = 4101;
    private static final int REQ_CAMERA_IMAGE = 4102;
    private static final int REQ_CAMERA_VIDEO = 4103;
    private static final int REQ_LOCATION = 4201;
    private static final int REQ_NATIVE_LOCATION = 4202;

    private WebView webView;
    private View splash;
    private boolean splashHidden = false;

    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;
    private File cameraOutputFile;

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private boolean geoRequested = false;

    private LocationManager nativeLocationManager;
    private LocationListener nativeLocationListener;
    private volatile Location nativeLastLocation;
    private volatile String nativeLocationError;
    private boolean nativeLocationStarted = false;
    private boolean nativeLocationPermissionPending = false;

    private NativeBridge nativeBridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        setContentView(R.layout.activity_main);

        splash = findViewById(R.id.splash);
        View root = findViewById(R.id.root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(0, bars.top, 0, Math.max(bars.bottom, ime.bottom));
            return insets;
        });

        webView = findViewById(R.id.webview);
        configureWebView();
        webView.loadUrl(START_URL);
        new Handler(Looper.getMainLooper()).postDelayed(this::hideSplash, 15000);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " JiyiAndroid/1.0");

        webView.setBackgroundColor(Color.rgb(243, 238, 226));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        nativeBridge = new NativeBridge();
        webView.addJavascriptInterface(nativeBridge, "JiyiAndroid");
        webView.setWebViewClient(new LocalClient());
        webView.setWebChromeClient(new LocalChromeClient());
    }

    private void hideSplash() {
        if (splashHidden || splash == null) return;
        splashHidden = true;
        splash.animate()
                .alpha(0f)
                .setDuration(240)
                .withEndAction(() -> splash.setVisibility(View.GONE))
                .start();
    }

    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri != null && APP_HOST.equals(uri.getHost())) {
                return serveAsset(uri);
            }
            return super.shouldInterceptRequest(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return false;
            if (APP_HOST.equals(uri.getHost())) return false;
            String scheme = uri.getScheme();
            if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)
                    || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No browser/app installed for this link.
                }
                return true;
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            hideSplash();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                hideSplash();
                Toast.makeText(MainActivity.this, "页面加载失败，请重新打开迹忆", Toast.LENGTH_LONG).show();
            }
        }
    }

    private WebResourceResponse serveAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        if (path.startsWith("/")) path = path.substring(1);
        if (path.contains("..")) return notFound();

        try {
            InputStream stream = getAssets().open("www/" + path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(mimeFor(path), "UTF-8", 200, "OK", headers, stream);
        } catch (IOException error) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not Found",
                null,
                new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
    }

    private static String mimeFor(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".webmanifest") || lower.endsWith(".manifest")) return "application/manifest+json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".woff2")) return "font/woff2";
        String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                MimeTypeMap.getFileExtensionFromUrl(path));
        return guessed == null ? "application/octet-stream" : guessed;
    }

    private class LocalChromeClient extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (hasLocationPermission()) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeoCallback = callback;
            pendingGeoOrigin = origin;
            if (geoRequested) {
                callback.invoke(origin, false, false);
                pendingGeoCallback = null;
                pendingGeoOrigin = null;
                return;
            }
            geoRequested = true;
            requestPermissions(
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                    REQ_LOCATION);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;
            String[] acceptTypes = normalizeMimeTypes(params.getAcceptTypes());
            boolean image = accepts(acceptTypes, "image/");
            boolean video = accepts(acceptTypes, "video/");
            boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;

            if (params.isCaptureEnabled()) {
                if (image && !video && launchCamera(false)) return true;
                if (video && !image && launchCamera(true)) return true;
            }
            openGallery(acceptTypes, multiple);
            return true;
        }

        @Override
        public void onConsoleMessage(String message, int lineNumber, String sourceID) {
            android.util.Log.d("JiyiWeb", sourceID + ":" + lineNumber + " " + message);
        }
    }

    private static boolean accepts(String[] types, String prefix) {
        for (String type : types) {
            if ("*/*".equals(type) || type.startsWith(prefix)) return true;
        }
        return false;
    }

    private static String[] normalizeMimeTypes(String[] acceptTypes) {
        LinkedHashSet<String> types = new LinkedHashSet<>();
        if (acceptTypes != null) {
            for (String raw : acceptTypes) {
                if (raw == null) continue;
                for (String piece : raw.split(",")) {
                    String value = piece.trim().toLowerCase(Locale.ROOT);
                    if (value.isEmpty()) continue;
                    if (value.startsWith(".")) {
                        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(value.substring(1));
                        if (mime != null) types.add(mime);
                    } else {
                        types.add(value);
                    }
                }
            }
        }
        if (types.isEmpty()) types.add("*/*");
        return types.toArray(new String[0]);
    }

    private void openGallery(String[] types, boolean multiple) {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        String type = types.length == 1 ? types[0] : "*/*";
        pick.setType(type);
        if (types.length > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, types);
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        try {
            startActivityForResult(Intent.createChooser(pick, "选择照片或视频"), REQ_PICK);
        } catch (Exception error) {
            finishFileChooser(null);
        }
    }

    private boolean launchCamera(boolean video) {
        File dir = new File(getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) {
            return false;
        }
        try {
            cameraOutputFile = File.createTempFile(video ? "capture_" : "photo_", video ? ".mp4" : ".jpg", dir);
            cameraOutputUri = FileProvider.getUriForFile(
                    this, getPackageName() + ".fileprovider", cameraOutputFile);
            Intent capture = new Intent(video ? MediaStore.ACTION_VIDEO_CAPTURE : MediaStore.ACTION_IMAGE_CAPTURE);
            capture.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
            if (video) capture.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1);
            capture.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(capture, video ? REQ_CAMERA_VIDEO : REQ_CAMERA_IMAGE);
            return true;
        } catch (Exception error) {
            if (cameraOutputFile != null) cameraOutputFile.delete();
            cameraOutputFile = null;
            cameraOutputUri = null;
            return false;
        }
    }

    private void finishFileChooser(Uri[] results) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
        cameraOutputUri = null;
        cameraOutputFile = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PICK && requestCode != REQ_CAMERA_IMAGE && requestCode != REQ_CAMERA_VIDEO) {
            return;
        }
        if (filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (requestCode == REQ_CAMERA_IMAGE || requestCode == REQ_CAMERA_VIDEO) {
                if (cameraOutputUri != null) results = new Uri[]{cameraOutputUri};
            } else if (data != null) {
                List<Uri> uris = new ArrayList<>();
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri uri = clip.getItemAt(i).getUri();
                        if (uri != null) uris.add(uri);
                    }
                } else if (data.getData() != null) {
                    uris.add(data.getData());
                }
                if (!uris.isEmpty()) results = uris.toArray(new Uri[0]);
            }
        }
        if (results == null && cameraOutputFile != null) cameraOutputFile.delete();
        finishFileChooser(results);
    }

    private void startNativeLocation() {
        if (!hasLocationPermission()) {
            if (!nativeLocationPermissionPending) {
                nativeLocationPermissionPending = true;
                requestPermissions(
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                        REQ_NATIVE_LOCATION);
            }
            return;
        }
        startNativeLocationInternal();
    }

    private void startNativeLocationInternal() {
        if (nativeLocationStarted) return;
        try {
            nativeLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (nativeLocationManager == null) {
                nativeLocationError = "手机定位服务不可用";
                return;
            }
            nativeLastLocation = null;
            nativeLocationError = null;
            nativeLocationListener = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    if (location == null) return;
                    nativeLastLocation = new Location(location);
                    nativeLocationError = null;
                }

                @Override
                public void onProviderEnabled(String provider) {
                    nativeLocationError = null;
                }

                @Override
                public void onProviderDisabled(String provider) {
                    if (nativeLocationManager == null || !isAnyLocationProviderEnabled()) {
                        nativeLocationError = "手机定位服务已关闭，请打开 GPS 后重试";
                    }
                }

                @Override
                public void onStatusChanged(String provider, int status, Bundle extras) {
                    // Deprecated on modern Android; kept for compatibility.
                }
            };

            boolean requested = false;
            boolean securityDenied = false;
            String[] providers = new String[]{
                    LocationManager.GPS_PROVIDER,
                    LocationManager.NETWORK_PROVIDER
            };
            for (String provider : providers) {
                try {
                    if (!nativeLocationManager.isProviderEnabled(provider)) continue;
                    nativeLocationManager.requestLocationUpdates(
                            provider, 1000L, 2f, nativeLocationListener, Looper.getMainLooper());
                    requested = true;
                    Location known = nativeLocationManager.getLastKnownLocation(provider);
                    if (known != null && System.currentTimeMillis() - known.getTime() < 15 * 60 * 1000L
                            && (nativeLastLocation == null || known.getTime() > nativeLastLocation.getTime())) {
                        nativeLastLocation = new Location(known);
                    }
                } catch (SecurityException permissionError) {
                    securityDenied = true;
                } catch (Exception providerError) {
                    // Try the next provider.
                }
            }
            if (!requested) {
                nativeLocationStarted = false;
                nativeLocationError = securityDenied
                        ? "缺少位置权限，请允许迹忆使用位置"
                        : "手机定位服务未开启，请打开 GPS 或网络定位";
                return;
            }
            nativeLocationError = null;
            nativeLocationStarted = true;
        } catch (Exception error) {
            nativeLocationStarted = false;
            nativeLocationError = "定位初始化失败，请重试";
        }
    }

    private void stopNativeLocation() {
        nativeLocationStarted = false;
        if (nativeLocationManager != null && nativeLocationListener != null) {
            try {
                nativeLocationManager.removeUpdates(nativeLocationListener);
            } catch (Exception ignored) {
                // Updates already gone.
            }
        }
        nativeLocationListener = null;
    }

    private boolean isAnyLocationProviderEnabled() {
        if (nativeLocationManager == null) return false;
        try {
            return nativeLocationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || nativeLocationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
            return false;
        }
    }

    private String getNativeLocationJson() {
        Location location = nativeLastLocation;
        if (location == null) return "";
        try {
            JSONObject json = new JSONObject();
            json.put("lat", location.getLatitude());
            json.put("lng", location.getLongitude());
            json.put("time", location.getTime());
            if (location.hasAltitude()) json.put("alt", location.getAltitude());
            if (location.hasAccuracy()) json.put("accuracy", location.getAccuracy());
            if (location.hasSpeed()) json.put("speed", location.getSpeed());
            if (location.hasBearing()) json.put("heading", location.getBearing());
            return json.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private String getNativeLocationError() {
        String error = nativeLocationError;
        return error == null ? "" : error;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NATIVE_LOCATION) {
            nativeLocationPermissionPending = false;
            boolean nativeGranted = false;
            for (int result : grantResults) {
                if (result == PackageManager.PERMISSION_GRANTED) {
                    nativeGranted = true;
                    break;
                }
            }
            if (nativeGranted) {
                startNativeLocationInternal();
            } else {
                nativeLocationError = "需要位置权限才能记录轨迹，请在系统设置中允许";
                Toast.makeText(this, "需要位置权限才能记录轨迹", Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != REQ_LOCATION) return;
        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }
        if (pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
        if (!granted) {
            Toast.makeText(this, "需要位置权限才能记录轨迹", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        stopNativeLocation();
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (nativeBridge != null) {
            nativeBridge.closePending();
        }
        if (webView != null) {
            webView.removeJavascriptInterface("JiyiAndroid");
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private String saveName(String raw, String mime) {
        String name = raw == null ? "jiyi-vlog" : raw;
        name = name.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "-").trim();
        if (name.isEmpty()) name = "jiyi-vlog";
        if (name.length() > 90) name = name.substring(0, 90);
        if (!name.contains(".")) {
            name += mime != null && mime.contains("mp4") ? ".mp4" : ".webm";
        }
        return name;
    }

    private class NativeBridge {
        private final Object saveLock = new Object();
        private File pendingFile;
        private BufferedOutputStream pendingOut;
        private String pendingMime;
        private Uri lastSavedUri;
        private String lastSavedMime = "video/webm";

        @JavascriptInterface
        public boolean beginSave(String filename, String mimeType) {
            synchronized (saveLock) {
                closePending();
                try {
                    File dir = new File(getCacheDir(), "share");
                    if (!dir.exists() && !dir.mkdirs()) return false;
                    pendingMime = (mimeType == null || mimeType.isEmpty()) ? "video/webm" : mimeType;
                    pendingFile = new File(dir, System.currentTimeMillis() + "-" + saveName(filename, pendingMime));
                    pendingOut = new BufferedOutputStream(new FileOutputStream(pendingFile));
                    lastSavedUri = null;
                    return true;
                } catch (Exception error) {
                    pendingFile = null;
                    pendingOut = null;
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean appendSave(String base64Chunk) {
            synchronized (saveLock) {
                if (pendingOut == null || base64Chunk == null) return false;
                try {
                    byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
                    pendingOut.write(bytes);
                    return true;
                } catch (Exception error) {
                    return false;
                }
            }
        }

        @JavascriptInterface
        public String finishSave() {
            Uri uri = null;
            String mime;
            synchronized (saveLock) {
                if (pendingOut == null || pendingFile == null) return "";
                mime = pendingMime;
                try {
                    pendingOut.flush();
                    pendingOut.close();
                    pendingOut = null;
                    try {
                        uri = saveToMediaStore(pendingFile, mime);
                    } catch (Exception mediaError) {
                        uri = saveToAppStorage(pendingFile, mime);
                    }
                    if (uri != null) {
                        lastSavedUri = uri;
                        lastSavedMime = mime;
                    }
                } catch (Exception error) {
                    uri = null;
                } finally {
                    if (pendingFile != null) pendingFile.delete();
                    pendingFile = null;
                    pendingMime = null;
                }
            }
            if (uri != null) {
                toastOnUi("已保存到 Movies/迹忆");
                return uri.toString();
            }
            toastOnUi("视频保存失败，请重试");
            return "";
        }

        @JavascriptInterface
        public void shareLast() {
            final Uri uri;
            final String mime;
            synchronized (saveLock) {
                uri = lastSavedUri;
                mime = lastSavedMime;
            }
            if (uri == null) {
                toastOnUi("还没有可分享的视频");
                return;
            }
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri("video", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivity(Intent.createChooser(send, "分享运动 Vlog"));
                } catch (Exception error) {
                    toastOnUi("没有找到可分享的应用");
                }
            });
        }

        @JavascriptInterface
        public void setKeepScreenOn(boolean keepOn) {
            runOnUiThread(() -> {
                if (keepOn) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void toast(String message) {
            toastOnUi(message);
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void startLocationUpdates() {
            runOnUiThread(MainActivity.this::startNativeLocation);
        }

        @JavascriptInterface
        public void stopLocationUpdates() {
            runOnUiThread(MainActivity.this::stopNativeLocation);
        }

        @JavascriptInterface
        public String getLocationJson() {
            return getNativeLocationJson();
        }

        @JavascriptInterface
        public String getLocationError() {
            return getNativeLocationError();
        }

        void closePending() {
            synchronized (saveLock) {
                if (pendingOut != null) {
                    try { pendingOut.close(); } catch (IOException ignored) { }
                    pendingOut = null;
                }
                if (pendingFile != null) {
                    pendingFile.delete();
                    pendingFile = null;
                }
                pendingMime = null;
            }
        }
    }

    private Uri saveToMediaStore(File source, String mime) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, displayName(source.getName()));
        values.put(MediaStore.Video.Media.MIME_TYPE, mime);
        values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/迹忆");
        values.put(MediaStore.Video.Media.IS_PENDING, 1);
        Uri uri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("MediaStore insert failed");
        try {
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException("Cannot open MediaStore output");
                copy(source, out);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Video.Media.IS_PENDING, 0);
            getContentResolver().update(uri, done, null, null);
            return uri;
        } catch (Exception error) {
            getContentResolver().delete(uri, null, null);
            throw new IOException(error);
        }
    }

    private Uri saveToAppStorage(File source, String mime) throws IOException {
        File dir = new File(getExternalFilesDir(Environment.DIRECTORY_MOVIES), "迹忆");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create movies directory");
        File target = new File(dir, displayName(source.getName()));
        try (OutputStream out = new FileOutputStream(target)) {
            copy(source, out);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", target);
    }

    private static String displayName(String fileName) {
        int dash = fileName.indexOf('-');
        if (dash > 0 && dash < 16) return fileName.substring(dash + 1);
        return fileName;
    }

    private static void copy(File source, OutputStream out) throws IOException {
        try (InputStream in = new FileInputStream(source)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        }
    }

    private void toastOnUi(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
    }
}
