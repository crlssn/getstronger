package studio.getstronger.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** The foreground service owns the clock, speech and private recording file. */
public class TimedCircuitService extends Service implements LocationListener {
    private static final String CHANNEL = "timed-circuit";
    private static JSONObject saved;
    private static TimedCircuitService active;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locations;
    private PowerManager.WakeLock wakeLock;
    private TextToSpeech speech;
    private boolean speechReady;
    private int spoken = -1;
    private long checkpoint;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            try { tick(); if (active != null) handler.postDelayed(this, 250); }
            catch (Exception error) { fail(); }
        }
    };
    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "timed-circuit.json"));
    }
    private static void load(Context context) throws Exception {
        if (saved != null || !file(context).getBaseFile().exists()) return;
        saved = new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8));
        JSONObject data = saved.getJSONObject("recording");
        if (!data.has("endedAt")) {
            data.put("interrupted", true);
            close(data, saved.getLong("checkpoint"));
            persist(context);
        }
    }
    static void prepare(Context context, JSONObject options) throws Exception {
        load(context);
        if (saved != null) throw new IllegalStateException("Another recording exists");
        JSONArray phases = options.getJSONArray("phases");
        if (phases.length() == 0 || phases.length() > 10000) throw new IllegalArgumentException("Invalid prescription");
        for (int i = 0; i < phases.length(); i++) {
            int duration = phases.getJSONObject(i).getInt("durationSeconds");
            if (duration <= 0 || duration > 86400) throw new IllegalArgumentException("Invalid duration");
        }
        long now = System.currentTimeMillis();
        JSONObject data = new JSONObject().put("version", 1).put("startedAt", now)
            .put("phases", phases).put("pauses", new JSONArray()).put("points", new JSONArray()).put("interrupted", false);
        saved = new JSONObject().put("key", options.getString("key")).put("locale", options.optString("locale", "en"))
            .put("recording", data).put("checkpoint", now);
        try { persist(context); } catch (Exception error) { saved = null; throw error; }
    }
    static JSONObject read(Context context, String key) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return new JSONObject();
        if (active != null) active.tick();
        return new JSONObject().put("recording", saved.getJSONObject("recording"));
    }
    static void command(Context context, String key, String command) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return;
        JSONObject data = saved.getJSONObject("recording");
        long now = System.currentTimeMillis();
        if (command.equals("clear")) {
            if (active != null) active.stopRecording();
            file(context).delete(); saved = null; return;
        }
        if (data.has("endedAt")) return;
        if (active != null) active.tick();
        if (data.has("endedAt")) return;
        JSONArray pauses = data.getJSONArray("pauses");
        boolean paused = pauses.length() > 0 && !pauses.getJSONObject(pauses.length() - 1).has("endedAt");
        if (command.equals("pause") && !paused) {
            pauses.put(new JSONObject().put("startedAt", now));
            if (active != null && active.speech != null) active.speech.stop();
        } else if (command.equals("resume") && paused) {
            pauses.getJSONObject(pauses.length() - 1).put("endedAt", now);
        } else if (command.equals("finish")) {
            close(data, now);
            if (active != null) active.stopRecording();
        }
        persist(context);
    }
    private static void close(JSONObject data, long time) throws Exception {
        data.put("endedAt", time);
        JSONArray pauses = data.getJSONArray("pauses");
        if (pauses.length() > 0 && !pauses.getJSONObject(pauses.length() - 1).has("endedAt")) {
            pauses.getJSONObject(pauses.length() - 1).put("endedAt", time);
        }
    }
    private static void persist(Context context) throws Exception {
        if (saved == null) return;
        saved.put("checkpoint", System.currentTimeMillis());
        AtomicFile file = file(context);
        FileOutputStream stream = file.startWrite();
        try { stream.write(saved.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
        catch (Exception error) { file.failWrite(stream); throw error; }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            load(this);
            if (saved == null || saved.getJSONObject("recording").has("endedAt")) { stopSelf(); return START_NOT_STICKY; }
            active = this;
            NotificationManager notifications = getSystemService(NotificationManager.class);
            notifications.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW));
            startForeground(1382, notification(saved.getJSONObject("recording").getJSONArray("phases").getJSONObject(0).getString("instruction")));
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "getstronger:timed-circuit");
            wakeLock.acquire(86400000L);
            locations = getSystemService(LocationManager.class);
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
            speech = new TextToSpeech(this, status -> {
                if (status == TextToSpeech.SUCCESS) {
                    speechReady = true;
                    speech.setLanguage(Locale.forLanguageTag(saved.optString("locale", "en")));
                } else { fail(); }
            });
            handler.post(ticker);
        } catch (Exception error) { fail(); }
        return START_NOT_STICKY;
    }
    private Notification notification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.app_name)).setContentText(text).setContentIntent(open).setOngoing(true).build();
    }
    private void tick() throws Exception {
        if (saved == null || active == null) return;
        JSONObject data = saved.getJSONObject("recording");
        if (data.has("endedAt")) return;
        long now = System.currentTimeMillis();
        long elapsed = now - data.getLong("startedAt");
        if (elapsed >= 86400000L) { fail(); return; }
        JSONArray pauses = data.getJSONArray("pauses");
        for (int i = 0; i < pauses.length(); i++) {
            JSONObject pause = pauses.getJSONObject(i);
            if (!pause.has("endedAt")) return;
            elapsed -= pause.getLong("endedAt") - pause.getLong("startedAt");
        }
        JSONArray phases = data.getJSONArray("phases");
        long boundary = 0;
        for (int index = 0; index < phases.length(); index++) {
            JSONObject phase = phases.getJSONObject(index);
            boundary += phase.getLong("durationSeconds") * 1000;
            if (elapsed < boundary) {
                if (spoken != index && speechReady) {
                    if (spoken >= 0 && index > spoken + 1) data.put("interrupted", true);
                    spoken = index;
                    String instruction = phase.getString("instruction");
                    if (speech.speak(instruction, TextToSpeech.QUEUE_FLUSH, null, "phase-" + index) == TextToSpeech.ERROR) data.put("interrupted", true);
                    getSystemService(NotificationManager.class).notify(1382, notification(instruction));
                }
                if (now - checkpoint > 1000) { persist(this); checkpoint = now; }
                return;
            }
        }
        close(data, now - (elapsed - boundary));
        persist(this);
        stopRecording();
    }
    @Override public void onLocationChanged(Location location) {
        try {
            tick();
            if (active == null) return;
            JSONObject data = saved.getJSONObject("recording");
            JSONArray pauses = data.getJSONArray("pauses");
            if (pauses.length() > 0 && !pauses.getJSONObject(pauses.length() - 1).has("endedAt")) return;
            JSONArray points = data.getJSONArray("points");
            long timestamp = location.getTime();
            if (timestamp < data.getLong("startedAt") || timestamp > System.currentTimeMillis() ||
                points.length() > 0 && timestamp <= points.getJSONObject(points.length() - 1).getLong("timestamp")) return;
            if (points.length() >= 90000) { fail(); return; }
            points.put(new JSONObject().put("timestamp", timestamp).put("latitude", location.getLatitude())
                .put("longitude", location.getLongitude()).put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 10000));
            persist(this);
        } catch (Exception error) { fail(); }
    }
    @Override public void onProviderDisabled(String provider) { fail(); }
    private void fail() {
        try {
            if (saved != null) {
                JSONObject data = saved.getJSONObject("recording");
                data.put("interrupted", true);
                if (!data.has("endedAt")) close(data, System.currentTimeMillis());
                persist(this);
            }
        } catch (Exception ignored) { /* The UI retains the last readable checkpoint as interrupted. */ }
        stopRecording();
    }
    private void stopRecording() {
        handler.removeCallbacks(ticker);
        if (locations != null) locations.removeUpdates(this);
        if (speech != null) { speech.stop(); speech.shutdown(); speech = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        active = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }
    @Override public void onDestroy() { if (active == this) fail(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
