package io.github.sicrics27gif.oc9;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.File;
import java.io.FileWriter;
import java.util.Locale;

/** 자동 동선 기록: 휴대폰 위치를 몇 분마다 이 휴대폰 안 파일에만 적어 둠 (서버로 보내지 않음) */
public class TrackService extends Service {
    static final String CH = "aob9_track";
    static volatile boolean running = false;
    private FusedLocationProviderClient fused;
    private LocationCallback cb;

    static File file(Context c) { return new File(c.getFilesDir(), "trail.csv"); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("aob9_track", MODE_PRIVATE); }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            prefs(this).edit().putBoolean("on", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "동선 기록", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 2, new Intent(this, TrackService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_aob)
                .setContentTitle("AOB9 동선 기록 중")
                .setContentText("다닌 곳이 자동으로 내 동선에 남습니다 · 이 휴대폰에만 저장")
                .setOngoing(true).setContentIntent(pi)
                .addAction(0, "기록 끄기", stop)
                .setPriority(NotificationCompat.PRIORITY_LOW).build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(73, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(73, n);
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        startUpdates();
        running = true;
        return START_STICKY;
    }

    private void startUpdates() {
        if (fused != null) return;
        fused = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 3 * 60 * 1000L)
                .setMinUpdateIntervalMillis(60 * 1000L)
                .setMinUpdateDistanceMeters(25f)
                .setMaxUpdateDelayMillis(10 * 60 * 1000L)
                .build();
        cb = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult r) {
                StringBuilder sb = new StringBuilder();
                for (Location l : r.getLocations()) {
                    if (l.getAccuracy() > 300) continue;
                    sb.append(l.getTime()).append(',').append(String.format(Locale.US, "%.5f,%.5f,%d", l.getLatitude(), l.getLongitude(), Math.round(l.getAccuracy()))).append('\n');
                }
                if (sb.length() == 0) return;
                synchronized (TrackService.class) {
                    try (FileWriter w = new FileWriter(file(TrackService.this), true)) { w.write(sb.toString()); } catch (Exception ignored) { }
                }
            }
        };
        try { fused.requestLocationUpdates(req, cb, Looper.getMainLooper()); } catch (SecurityException e) { stopSelf(); }
    }

    @Override
    public void onDestroy() {
        running = false;
        try { if (fused != null && cb != null) fused.removeLocationUpdates(cb); } catch (Exception ignored) { }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
