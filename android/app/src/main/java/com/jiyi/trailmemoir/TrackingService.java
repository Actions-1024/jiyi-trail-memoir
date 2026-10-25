package com.jiyi.trailmemoir;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.List;

/**
 * Foreground location recorder. The WebView can be suspended while the phone
 * is locked, but this service keeps the GPS/network listener alive and stores
 * every fix in a small append-only file. The web recorder pulls the backlog
 * when the app comes back to the foreground.
 */
public class TrackingService extends Service {
    public static final String ACTION_START = "com.jiyi.trailmemoir.tracking.START";
    public static final String ACTION_START_NEW = "com.jiyi.trailmemoir.tracking.START_NEW";
    public static final String ACTION_STOP = "com.jiyi.trailmemoir.tracking.STOP";
    public static final String ACTION_CLEAR = "com.jiyi.trailmemoir.tracking.CLEAR";

    private static final String CHANNEL_ID = "jiyi_tracking";
    private static final int NOTIFICATION_ID = 701;
    private static final String FILE_NAME = "active-track.jsonl";
    private static final Object POINTS_LOCK = new Object();
    private static final List<JSONObject> POINTS = new ArrayList<>();

    private static volatile boolean running = false;
    private static volatile String lastError = "";

    private LocationManager locationManager;
    private LocationListener locationListener;
    private PowerManager.WakeLock wakeLock;
    private BufferedWriter writer;
    private File trackFile;

    public static void start(Context context, boolean clearExisting) {
        lastError = "";
        try {
            ContextCompat.startForegroundService(
                    context,
                    new Intent(context, TrackingService.class)
                            .setAction(clearExisting ? ACTION_START_NEW : ACTION_START));
        } catch (Exception error) {
            lastError = "无法启动后台定位服务，请把迹忆切到前台后重试";
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, TrackingService.class));
    }

    public static void clear(Context context) {
        context.startService(new Intent(context, TrackingService.class).setAction(ACTION_CLEAR));
    }

    public static boolean isRunning() {
        return running;
    }

    public static String getLastError() {
        return lastError;
    }

    public static void setLastError(String message) {
        lastError = message == null ? "" : message;
    }

    public static String pointsSince(long since) {
        JSONArray array = new JSONArray();
        synchronized (POINTS_LOCK) {
            for (JSONObject point : POINTS) {
                if (point.optLong("time", 0) >= since) array.put(point);
            }
        }
        return array.toString();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        trackFile = new File(getFilesDir(), FILE_NAME);
        loadPoints();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            return START_NOT_STICKY;
        }
        if (ACTION_CLEAR.equals(action)) {
            clearTrack();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_START_NEW.equals(action)) {
            if (running) {
                running = false;
                stopLocationUpdates();
            }
            clearTrack();
        }
        startTracking();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopTracking();
        super.onDestroy();
    }

    private void startTracking() {
        if (running) return;
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception error) {
            lastError = "无法启动后台定位服务";
            stopSelf();
            return;
        }

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jiyi:tracking");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(12 * 60 * 60 * 1000L);
        }

        ensureWriter();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            lastError = "手机定位服务不可用";
            stopTracking();
            return;
        }

        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                appendPoint(location);
            }

            @Override
            public void onProviderEnabled(String provider) {
                lastError = "";
            }

            @Override
            public void onProviderDisabled(String provider) {
                if (!isAnyProviderEnabled()) lastError = "手机定位服务已关闭";
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
                // Deprecated on modern Android.
            }
        };

        boolean requested = false;
        for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            try {
                if (!locationManager.isProviderEnabled(provider)) continue;
                locationManager.requestLocationUpdates(
                        provider, 2000L, 2f, locationListener, Looper.getMainLooper());
                requested = true;
                Location known = locationManager.getLastKnownLocation(provider);
                if (known != null && System.currentTimeMillis() - known.getTime() < 10 * 60 * 1000L) {
                    appendPoint(known);
                }
            } catch (SecurityException permissionError) {
                lastError = "需要位置权限才能后台记录轨迹";
            } catch (Exception ignored) {
                // Try the other provider.
            }
        }

        if (!requested) {
            if (lastError == null || lastError.isEmpty()) {
                lastError = "手机定位服务未开启，请打开 GPS 或网络定位";
            }
            stopTracking();
            return;
        }
        running = true;
        lastError = "";
    }

    private boolean isAnyProviderEnabled() {
        if (locationManager == null) return false;
        try {
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void stopTracking() {
        running = false;
        stopLocationUpdates();
        closeWriter();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void stopLocationUpdates() {
        if (locationManager != null && locationListener != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {
                // Already removed.
            }
        }
        locationListener = null;
        locationManager = null;
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void appendPoint(Location location) {
        if (location == null) return;
        long time = location.getTime();
        if (time <= 0) time = System.currentTimeMillis();
        synchronized (POINTS_LOCK) {
            JSONObject last = POINTS.isEmpty() ? null : POINTS.get(POINTS.size() - 1);
            if (last != null) {
                long dt = time - last.optLong("time", 0);
                if (dt < 1500 && distanceMeters(last.optDouble("lat"), last.optDouble("lng"),
                        location.getLatitude(), location.getLongitude()) < 2) {
                    return;
                }
            }
            try {
                JSONObject point = new JSONObject();
                point.put("lat", location.getLatitude());
                point.put("lng", location.getLongitude());
                point.put("time", time);
                if (location.hasAltitude()) point.put("alt", location.getAltitude());
                if (location.hasAccuracy()) point.put("accuracy", location.getAccuracy());
                if (location.hasSpeed()) point.put("speed", location.getSpeed());
                if (location.hasBearing()) point.put("heading", location.getBearing());
                POINTS.add(point);
                if (writer != null) {
                    writer.write(point.toString());
                    writer.newLine();
                    writer.flush();
                }
            } catch (Exception ignored) {
                // A malformed fix must not kill tracking.
            }
        }
    }

    private static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private void loadPoints() {
        if (trackFile == null || !trackFile.exists()) return;
        synchronized (POINTS_LOCK) {
            POINTS.clear();
            try (BufferedReader reader = new BufferedReader(new FileReader(trackFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    try {
                        POINTS.add(new JSONObject(line));
                    } catch (Exception ignored) {
                        // Skip a torn final line after a process kill.
                    }
                }
            } catch (Exception ignored) {
                // An unreadable cache is not fatal; start a new track.
            }
        }
    }

    private void clearTrack() {
        synchronized (POINTS_LOCK) {
            POINTS.clear();
            closeWriter();
            if (trackFile != null) trackFile.delete();
            lastError = "";
        }
    }

    private void closeWriter() {
        if (writer != null) {
            try {
                writer.close();
            } catch (Exception ignored) {
                // Already closed.
            }
            writer = null;
        }
    }

    private void ensureWriter() {
        if (writer != null || trackFile == null) return;
        try {
            writer = new BufferedWriter(new FileWriter(trackFile, true));
        } catch (Exception ignored) {
            writer = null;
        }
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "轨迹记录", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("锁屏或后台时持续记录运动轨迹");
            channel.setShowBadge(false);
            if (manager != null) manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.splash_mark)
                .setContentTitle("迹忆正在记录轨迹")
                .setContentText("锁屏或后台也会继续记录 · 点击回到应用")
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }
}
