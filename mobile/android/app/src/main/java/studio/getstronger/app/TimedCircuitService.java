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
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** The foreground service owns the clock, speech and private recording file. */
public class TimedCircuitService extends Service implements LocationListener {
    private static final String CHANNEL = "timed-circuit";
    /**
     * How loud a pace note is against a full-volume announcement: a fifth was
     * lost under a footfall on a busy road.
     */
    private static final double PACE_TONE_VOLUME = 0.6;
    /**
     * The shortest interval with a midpoint worth naming, in seconds, and the
     * ground a pace holds behind before it is a number, in metres. Both mirror
     * {@code web/src/utils/halfwayCue.ts} and {@code paceFloorMeters}.
     */
    private static final double HALFWAY_FLOOR_SECONDS = 60;
    private static final double PACE_FLOOR_METRES = 20;
    /** The token the halfway phrase leaves for the pace measured over the interval. */
    private static final String PACE_PLACEHOLDER = "{pace}";
    /** How long the ending is given to be said before the service goes anyway. */
    private static final long COMPLETION_MS = 10000;
    private static final String COMPLETION_ID = "completed";
    // Auto-pause, mirroring web/src/utils/movement.ts: under half a slow walk
    // for the dwell holds the recording, over that again lets it go. The gap
    // between the two keeps a pace either side of one line from fluttering it,
    // and the dwell is short because the hold is backdated to where the
    // athlete stopped.
    private static final double PAUSE_SPEED = 2000.0 / 3600;
    private static final double RESUME_SPEED = 3000.0 / 3600;
    private static final long DWELL_MS = 2000;
    private static final long CONTINUOUS_MS = 3000;
    private static final int MAX_FIXES = 60;
    private static final double MAX_ACCURACY = 30;
    /**
     * Under this a measured speed is a phone standing and its fixes wandering,
     * mirroring {@code standingSpeed} in {@code web/src/utils/timedCircuit.ts}.
     */
    private static final double STANDING_SPEED = 0.3;
    /**
     * How fast the position filter lets the athlete have moved since the last
     * fix, mirroring {@code wanderSpeed} in {@code web/src/utils/timedCircuit.ts}.
     */
    private static final double WANDER_SPEED = 3;
    /** One fix as the detector reads it: the route's, plus a measured speed. */
    private static final class Fix {
        final long timestamp;
        final double latitude;
        final double longitude;
        final double accuracy;
        final Double speed;
        Fix(long timestamp, double latitude, double longitude, double accuracy, Double speed) {
            this.timestamp = timestamp;
            this.latitude = latitude;
            this.longitude = longitude;
            this.accuracy = accuracy;
            this.speed = speed;
        }
    }
    private final List<Fix> fixes = new ArrayList<>();
    /** The route as {@link #smoothedPoints} has read it so far, and the filter's state. */
    private final List<JSONObject> smoothed = new ArrayList<>();
    private int filtered;
    private double filterLatitude;
    private double filterLongitude;
    private double filterVariance;
    private long filterAt;
    private static JSONObject saved;
    private static TimedCircuitService active;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locations;
    private PowerManager.WakeLock wakeLock;
    private TextToSpeech speech;
    private boolean speechReady;
    /** The focus other audio is held down by while a word is said, or null. */
    private AudioFocusRequest ducking;
    /** Announcements still to be said, so the duck lifts after the last of them. */
    private int speaking;
    private int spoken = -1;
    /** The interval already warned about, so the cue is said once per interval. */
    private int cued = -1;
    /** The interval already called halfway, so the call is made once per interval. */
    private int halved = -1;
    /** Whether the service is staying up only to finish saying the ending. */
    private boolean completing;
    private boolean stopped;
    private final Runnable stopper = this::stopRecording;
    private long checkpoint;
    // The session this one is paced against, as the web app settled it: a
    // target for each interval, and the three numbers that say when a
    // difference is worth hearing. No targets is a recording with nothing to
    // compare against, which is every first recording of a routine.
    private double[] paceTargets = new double[0];
    private double paceTolerance;
    private double paceGap;
    private double paceWindow;
    private String paceZone = "";
    private int paceZonePhase = -1;
    private long paceTonedAt;
    private AudioTrack aheadTone;
    private AudioTrack behindTone;
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
        // A lone phase naming no duration is the open interval of a session with
        // no set length; every other prescription is held against the clock.
        if (phases.length() > 1 || !phases.getJSONObject(0).isNull("durationSeconds")) {
            for (int i = 0; i < phases.length(); i++) {
                int duration = phases.getJSONObject(i).optInt("durationSeconds", 0);
                if (duration <= 0 || duration > 86400) throw new IllegalArgumentException("Invalid duration");
            }
        }
        long now = System.currentTimeMillis();
        JSONObject data = new JSONObject().put("version", 1).put("startedAt", now)
            .put("phases", phases).put("pauses", new JSONArray()).put("points", new JSONArray()).put("interrupted", false);
        saved = new JSONObject().put("key", options.getString("key")).put("locale", options.optString("locale", "en"))
            .put("volume", level(options.optDouble("volume", 1)))
            .put("cueLeadSeconds", options.optInt("cueLeadSeconds", 10))
            .put("cuePhrase", options.optString("cuePhrase", ""))
            .put("halfwayPhrase", options.optString("halfwayPhrase", ""))
            .put("distanceUnit", options.optString("distanceUnit", "km"))
            .put("completedPhrase", options.optString("completedPhrase", ""))
            .put("autoPause", options.optBoolean("autoPause"))
            .put("recording", data).put("checkpoint", now);
        if (options.optJSONObject("pacing") != null) saved.put("pacing", options.getJSONObject("pacing"));
        try { persist(context); } catch (Exception error) { saved = null; throw error; }
    }
    static JSONObject read(Context context, String key) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return new JSONObject();
        if (active != null) active.tick();
        return new JSONObject().put("recording", saved.getJSONObject("recording"));
    }
    /** How loudly the phases are announced, 0 to 1; 0 speaks nothing at all. */
    private static double level(double volume) {
        return Math.min(Math.max(volume, 0), 1);
    }
    static void setVolume(Context context, String key, double volume) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return;
        double next = level(volume);
        saved.put("volume", next);
        if (next == 0 && active != null && active.speech != null) active.speech.stop();
        persist(context);
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
            fixes.clear();
            halved = -1;
            resetFilter();
            NotificationManager notifications = getSystemService(NotificationManager.class);
            notifications.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW));
            startForeground(1382, notification(saved.getJSONObject("recording").getJSONArray("phases").getJSONObject(0).getString("instruction")));
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "getstronger:timed-circuit");
            wakeLock.acquire(86400000L);
            locations = getSystemService(LocationManager.class);
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
            readPacing(saved.optJSONObject("pacing"));
            speech = new TextToSpeech(this, status -> {
                if (status == TextToSpeech.SUCCESS) {
                    speechReady = true;
                    // The language alone leaves the engine free to answer with
                    // its flattest voice, which is what it used to announce in.
                    AnnouncementVoice.choose(speech, saved.optString("locale", "en"));
                    // The ending is the last thing said, and the service waits
                    // for it: shut down under an utterance, it cuts the word off.
                    speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onDone(String id) { spoken(id); }
                        @Override public void onError(String id) { spoken(id); }
                        // A queue flushed by the next instruction drops what
                        // was pending without ever finishing it, and an
                        // announcement nobody counts back holds the duck open.
                        @Override public void onStop(String id, boolean interrupted) { spoken(id); }
                        // Off the synthesiser's thread: the duck and the
                        // service's own shutdown are the main thread's.
                        private void spoken(String id) {
                            handler.post(() -> {
                                said();
                                if (COMPLETION_ID.equals(id)) stopper.run();
                            });
                        }
                    });
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
        if (saved == null || active == null || completing) return;
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
            boolean open = phase.isNull("durationSeconds");
            long opened = boundary;
            if (!open) boundary += phase.getLong("durationSeconds") * 1000;
            if (open || elapsed < boundary) {
                if (spoken != index && speechReady) {
                    if (spoken >= 0 && index > spoken + 1) data.put("interrupted", true);
                    spoken = index;
                    String instruction = phase.getString("instruction");
                    if (announce(instruction, "phase-" + index, TextToSpeech.QUEUE_FLUSH, volume()) == TextToSpeech.ERROR) data.put("interrupted", true);
                    getSystemService(NotificationManager.class).notify(1382, notification(instruction));
                }
                long lead = saved.optInt("cueLeadSeconds", 10) * 1000L;
                if (cued != index && cues(phase, lead) && elapsed >= boundary - lead && speechReady) {
                    cued = index;
                    // Queued behind the instruction rather than over it, and
                    // its own setting: with the announcements off it is said
                    // at full volume instead of not at all.
                    announce(saved.optString("cuePhrase", ""), "cue-" + index, TextToSpeech.QUEUE_ADD, volume() > 0 ? volume() : 1);
                }
                double phaseSeconds = (elapsed - opened) / 1000.0;
                callHalfway(index, phase, phaseSeconds, now);
                judge(index, phaseSeconds, now);
                if (now - checkpoint > 1000) { persist(this); checkpoint = now; }
                return;
            }
        }
        close(data, now - (elapsed - boundary));
        persist(this);
        // The prescription ran out on its own, which is the one ending worth
        // announcing; the service stays up until it has been said.
        String completed = saved.optString("completedPhrase", "");
        if (completed.isEmpty() || volume() == 0 || !speechReady
            || announce(completed, COMPLETION_ID, TextToSpeech.QUEUE_ADD, volume()) != TextToSpeech.SUCCESS) {
            stopRecording();
            return;
        }
        completing = true;
        handler.postDelayed(stopper, COMPLETION_MS);
    }
    private double volume() {
        return level(saved.optDouble("volume", 1));
    }
    /** Turned all the way down speaks nothing: a silent utterance still takes audio focus for nothing. */
    private int announce(String phrase, String id, int queue, double volume) {
        if (volume == 0 || phrase.isEmpty()) return TextToSpeech.SUCCESS;
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) volume);
        speaking++;
        duck();
        int result = speech.speak(AnnouncementVoice.phrase(phrase), queue, params, id);
        if (result == TextToSpeech.ERROR) said();
        return result;
    }
    /**
     * Holds whatever else is playing down while a word is said.
     *
     * Playing over the top lost a cue under a chorus. How far the other audio
     * drops is the system's to decide — around a fifth of where it was — and
     * transient ducking is the whole of the request: there is no level to ask
     * for.
     */
    private void duck() {
        if (ducking != null) return;
        AudioManager audio = getSystemService(AudioManager.class);
        if (audio == null) return;
        AudioFocusRequest request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .build();
        if (audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) ducking = request;
    }
    /** One announcement done with; the last of them lets the other audio back up. */
    private void said() {
        speaking = Math.max(0, speaking - 1);
        if (speaking > 0) return;
        AudioManager audio = getSystemService(AudioManager.class);
        if (audio != null && ducking != null) audio.abandonAudioFocusRequest(ducking);
        ducking = null;
    }
    /**
     * Whether an interval is long enough to be worth warning about.
     *
     * A cue at or before the midpoint is a second instruction rather than a
     * warning, so anything shorter than twice the lead runs out unannounced.
     */
    private static boolean cues(JSONObject phase, long leadMs) throws Exception {
        if (leadMs <= 0 || phase.isNull("durationSeconds")) return false;
        return phase.getLong("durationSeconds") * 1000L >= leadMs * 2;
    }

    /** The comparison the recorder holds each interval to, or none at all. */
    private void readPacing(JSONObject pacing) {
        paceZone = "";
        paceZonePhase = -1;
        paceTonedAt = 0;
        if (pacing == null) return;
        JSONArray targets = pacing.optJSONArray("targets");
        paceTargets = new double[targets == null ? 0 : targets.length()];
        for (int index = 0; index < paceTargets.length; index++) paceTargets[index] = targets.optDouble(index, 0);
        paceTolerance = pacing.optDouble("toleranceSeconds", 0);
        paceGap = pacing.optDouble("minimumGapSeconds", 0);
        paceWindow = pacing.optDouble("windowSeconds", 0);
        if (paceTargets.length == 0) return;
        // Higher for ahead and lower for behind, generated rather than
        // shipped: the same two notes the browser recorder sounds. The cue is
        // spoken, so a note is never mistaken for it.
        aheadTone = note(1320);
        behindTone = note(440);
    }

    private AudioTrack note(double hertz) {
        int rate = 44100;
        int frames = (int) (rate * 0.3);
        short[] samples = new short[frames];
        for (int frame = 0; frame < frames; frame++) {
            // Faded at both ends: a square edge on a sine is heard as a click.
            double fade = Math.min(1.0, Math.min(frame, frames - frame) / (rate * 0.02));
            samples[frame] = (short) (Math.sin(2 * Math.PI * hertz * frame / rate) * Short.MAX_VALUE * fade);
        }
        AudioTrack track = new AudioTrack.Builder()
            // Media rather than a system sound: the note follows the volume
            // the announcements play at, not the one the ringer is set to.
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(rate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(samples.length * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build();
        track.write(samples, 0, samples.length);
        return track;
    }

    /** A note follows the announcement volume: a session that says nothing must not beep. */
    private void play(String zone) {
        AudioTrack track = zone.equals("ahead") ? aheadTone : behindTone;
        double volume = level(saved.optDouble("volume", 1));
        if (track == null || volume == 0) return;
        try {
            track.setVolume((float) (PACE_TONE_VOLUME * volume));
            track.stop();
            track.reloadStaticData();
            track.play();
        } catch (IllegalStateException error) { /* A note nobody hears is not worth a failed session. */ }
    }

    private void resetFilter() {
        smoothed.clear();
        filtered = 0;
        filterAt = 0;
    }

    /**
     * The route as the athlete most likely ran it, mirroring {@code smoothRoute}
     * in {@code web/src/utils/timedCircuit.ts}: a Kalman filter on each axis,
     * weighing every usable fix by its accuracy against how far the athlete
     * could have moved since the last. Kept up with the recording rather than
     * re-read from the start on every tick.
     */
    private List<JSONObject> smoothedPoints(JSONArray points) throws Exception {
        if (points.length() < filtered) resetFilter();
        for (; filtered < points.length(); filtered++) {
            JSONObject point = points.getJSONObject(filtered);
            double accuracy = point.optDouble("accuracy", -1);
            long timestamp = point.getLong("timestamp");
            if (accuracy < 0 || accuracy > MAX_ACCURACY || (!smoothed.isEmpty() && timestamp <= filterAt)) continue;
            double latitude = point.getDouble("latitude");
            double longitude = point.getDouble("longitude");
            double noise = accuracy * accuracy;
            if (smoothed.isEmpty()) {
                filterLatitude = latitude;
                filterLongitude = longitude;
                filterVariance = noise;
            } else {
                filterVariance += WANDER_SPEED * WANDER_SPEED * (timestamp - filterAt) / 1000.0;
                double gain = filterVariance + noise > 0 ? filterVariance / (filterVariance + noise) : 1;
                filterLatitude += gain * (latitude - filterLatitude);
                double eastward = ((longitude - filterLongitude + 540) % 360) - 180;
                filterLongitude = ((filterLongitude + gain * eastward + 540) % 360) - 180;
                filterVariance *= 1 - gain;
            }
            filterAt = timestamp;
            JSONObject copy = new JSONObject(point.toString());
            copy.put("latitude", filterLatitude).put("longitude", filterLongitude);
            smoothed.add(copy);
        }
        return smoothed;
    }

    /**
     * Whether the movement between two smoothed fixes is worth measuring, on the
     * same terms the app measures a saved route on: in order, and slow enough to
     * be a person on foot.
     */
    private boolean accepted(JSONObject a, JSONObject b) throws Exception {
        double seconds = (b.getLong("timestamp") - a.getLong("timestamp")) / 1000.0;
        return seconds > 0 && metres(a, b) / seconds <= 15;
    }

    /** Whether the recording was held for any of the time between two fixes. */
    private boolean spansPause(JSONObject a, JSONObject b, JSONArray pauses) throws Exception {
        for (int index = 0; index < pauses.length(); index++) {
            JSONObject pause = pauses.getJSONObject(index);
            long ended = pause.has("endedAt") ? pause.getLong("endedAt") : Long.MAX_VALUE;
            if (a.getLong("timestamp") < ended && b.getLong("timestamp") > pause.getLong("startedAt")) return true;
        }
        return false;
    }

    /**
     * How far the athlete went between two smoothed fixes, as the app measures
     * it: the chord, unless the receiver read the phone as standing at both
     * ends, which is a phone at a crossing and its fixes wandering.
     */
    private double edgeMetres(JSONObject a, JSONObject b) throws Exception {
        if (a.has("speed") && b.has("speed") && (a.getDouble("speed") + b.getDouble("speed")) / 2 < STANDING_SPEED) return 0;
        return metres(a, b);
    }

    private double metres(JSONObject a, JSONObject b) throws Exception {
        double from = Math.toRadians(a.getDouble("latitude"));
        double to = Math.toRadians(b.getDouble("latitude"));
        double latitude = to - from;
        double longitude = Math.toRadians(b.getDouble("longitude") - a.getDouble("longitude"));
        double h = Math.pow(Math.sin(latitude / 2), 2)
            + Math.cos(from) * Math.cos(to) * Math.pow(Math.sin(longitude / 2), 2);
        return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /**
     * Pace over a trailing window in seconds per kilometre, or nothing: one
     * fix is a position rather than a speed.
     *
     * The pace tones judge over the window their reference session set; the
     * halfway call asks for the interval so far, with the same floor the live
     * screen holds a pace back for.
     */
    private double currentPace(long time, double window, double floorMetres) throws Exception {
        JSONObject data = saved.getJSONObject("recording");
        List<JSONObject> points = smoothedPoints(data.getJSONArray("points"));
        JSONArray pauses = data.getJSONArray("pauses");
        double since = time - window * 1000;
        double covered = 0;
        double seconds = 0;
        for (int index = 1; index < points.size(); index++) {
            JSONObject a = points.get(index - 1);
            JSONObject b = points.get(index);
            long closed = b.getLong("timestamp");
            // Whole edges, by the fix that closed them, as the app measures. An
            // edge across a pause is mostly standing, which is not a pace.
            if (closed <= since || closed > time || !accepted(a, b) || spansPause(a, b, pauses)) continue;
            covered += edgeMetres(a, b);
            seconds += (closed - a.getLong("timestamp")) / 1000.0;
        }
        return covered > 0 && covered >= floorMetres ? (seconds / covered) * 1000 : 0;
    }

    /**
     * Calls the midpoint of a worked interval with the pace held over it.
     *
     * A rest is named by the recording but is not worked, and an open interval
     * has no end to halve, so neither is called. The call is made once whether
     * or not a pace came back: one arriving at four fifths of an interval is
     * not a call at its midpoint. Like the interval cue it is a setting of its
     * own, so muted announcements do not silence it.
     */
    private void callHalfway(int index, JSONObject phase, double seconds, long time) throws Exception {
        String phrase = saved.optString("halfwayPhrase", "");
        if (halved == index || phrase.isEmpty() || !speechReady) return;
        if (phase.optString("exerciseId", "").isEmpty() || phase.isNull("durationSeconds")) return;
        double duration = phase.getLong("durationSeconds");
        if (duration < HALFWAY_FLOOR_SECONDS || seconds < duration / 2) return;
        halved = index;
        double pace = currentPace(time, seconds, PACE_FLOOR_METRES);
        if (pace <= 0) return;
        double volume = volume() > 0 ? volume() : 1;
        announce(phrase.replace(PACE_PLACEHOLDER, spokenPace(pace)), "halfway-" + index, TextToSpeech.QUEUE_ADD, volume);
    }

    /**
     * A pace as mm:ss in the athlete's unit, mirroring {@code paceIn} in the
     * web app: seconds per kilometre is what every recorder measures.
     */
    private String spokenPace(double secondsPerKilometre) {
        boolean miles = "mi".equals(saved.optString("distanceUnit", "km"));
        long perUnit = Math.round(miles ? secondsPerKilometre * 1.609344 : secondsPerKilometre);
        return String.format(Locale.US, "%d:%02d", perUnit / 60, perUnit % 60);
    }

    /**
     * Sounds the crossing where this interval leaves the band the reference
     * session set for it, at most once every gap.
     */
    private void judge(int index, double seconds, long time) throws Exception {
        // Turned off, nothing is judged rather than judged and swallowed:
        // turning the sound back on hears the next crossing rather than
        // missing it.
        if (level(saved.optDouble("volume", 1)) == 0) return;
        if (paceZonePhase != index) {
            paceZonePhase = index;
            paceZone = "";
        }
        if (index >= paceTargets.length) return;
        double target = paceTargets[index];
        if (target <= 0 || seconds < paceWindow) return;
        double pace = currentPace(time, paceWindow, 0);
        if (pace <= 0) return;

        String zone = pace < target - paceTolerance ? "ahead" : pace > target + paceTolerance ? "behind" : "holding";
        if (zone.equals("holding")) {
            paceZone = zone;
            return;
        }
        // A crossing the gap swallowed stays pending, so it is heard late
        // rather than not at all.
        if (zone.equals(paceZone) || (paceTonedAt != 0 && time - paceTonedAt < paceGap * 1000)) return;
        paceZone = zone;
        paceTonedAt = time;
        play(zone);
    }

    @Override public void onLocationChanged(Location location) {
        try {
            tick();
            if (active == null) return;
            JSONObject data = saved.getJSONObject("recording");
            JSONArray points = data.getJSONArray("points");
            long timestamp = location.getTime();
            long seen = points.length() > 0 ? points.getJSONObject(points.length() - 1).getLong("timestamp") : 0;
            if (!fixes.isEmpty()) seen = Math.max(seen, fixes.get(fixes.size() - 1).timestamp);
            if (timestamp < data.getLong("startedAt") || timestamp > System.currentTimeMillis() || timestamp <= seen) return;
            double accuracy = location.hasAccuracy() ? location.getAccuracy() : 10000;
            Double speed = location.hasSpeed() ? (double) location.getSpeed() : null;
            fixes.add(new Fix(timestamp, location.getLatitude(), location.getLongitude(), accuracy, speed));
            if (fixes.size() > MAX_FIXES) fixes.remove(0);
            autoPause(timestamp);
            JSONArray pauses = data.getJSONArray("pauses");
            // A hold the detector opened stops the clock, not the route: it may
            // have read a creep as a standstill. A hold the athlete opened drops
            // its fixes, because they may have gone home with it still open.
            JSONObject open = pauses.length() > 0 ? pauses.getJSONObject(pauses.length() - 1) : null;
            if (open != null && !open.has("endedAt") && !open.has("auto")) return;
            if (points.length() >= 90000) { fail(); return; }
            JSONObject point = new JSONObject().put("timestamp", timestamp).put("latitude", location.getLatitude())
                .put("longitude", location.getLongitude()).put("accuracy", accuracy);
            if (speed != null) point.put("speed", (double) speed);
            points.put(point);
            persist(this);
        } catch (Exception error) { fail(); }
    }

    /**
     * Hold or release the recording on what the fixes say, when it was asked to.
     *
     * Only a pause it opened itself is released: an athlete who paused by hand
     * meant it, and the traffic moving off is not their cue to start recording.
     */
    private void autoPause(long at) throws Exception {
        if (saved == null || !saved.optBoolean("autoPause")) return;
        JSONObject data = saved.getJSONObject("recording");
        if (data.has("endedAt")) return;
        JSONArray pauses = data.getJSONArray("pauses");
        JSONObject last = pauses.length() > 0 ? pauses.getJSONObject(pauses.length() - 1) : null;
        JSONObject open = last != null && !last.has("endedAt") ? last : null;
        if (open != null && !open.optBoolean("auto")) return;
        String movement = readMovement(at);
        if (movement == null) return;
        if (open != null) {
            if (!movement.equals("moving")) return;
            open.put("endedAt", at);
        } else {
            if (!movement.equals("still")) return;
            // Held from where the athlete stopped rather than from where the
            // dwell noticed, and never back past the last thing that happened.
            long after = last != null ? last.getLong("endedAt") : data.getLong("startedAt");
            pauses.put(new JSONObject().put("startedAt", Math.max(at - DWELL_MS, after)).put("auto", true));
            if (speech != null) speech.stop();
        }
        persist(this);
    }

    /**
     * The fixes from the last one at or before {@code since} up to {@code at},
     * or null when a hole interrupts them: it hides whatever happened during it.
     */
    private List<Fix> unbroken(long since, long at) {
        List<Fix> window = new ArrayList<>();
        boolean anchored = false;
        for (Fix fix : fixes) {
            if (fix.accuracy < 0 || fix.accuracy > MAX_ACCURACY || fix.timestamp > at) continue;
            if (fix.timestamp <= since) { window.clear(); anchored = true; }
            window.add(fix);
        }
        if (!anchored) return null;
        long previous = window.get(0).timestamp;
        for (Fix fix : window) {
            if (fix.timestamp - previous > CONTINUOUS_MS) return null;
            previous = fix.timestamp;
        }
        return at - previous > CONTINUOUS_MS ? null : window;
    }

    /**
     * What the recent fixes say the athlete is doing, or null when they say
     * neither, mirroring {@code readMovement} in web/src/utils/movement.ts. A
     * receiver that measures speed is believed over the dwell. One that does not
     * leaves only where its fixes landed, whose error circles bound the movement
     * either way, so the window grows until a standing athlete's bound falls
     * under the pause speed and says nothing before that.
     */
    private String readMovement(long at) {
        // The window reaches back to where the athlete was when the dwell
        // began, so it starts at the last fix from before that.
        List<Fix> dwell = unbroken(at - DWELL_MS, at);
        if (dwell == null) return null;
        Double fastest = null;
        double radius = 0;
        for (Fix fix : dwell) {
            if (fix.speed != null && (fastest == null || fix.speed > fastest)) fastest = fix.speed;
            radius = Math.max(radius, fix.accuracy);
        }
        if (fastest != null) {
            if (fastest < PAUSE_SPEED) return "still";
            return fastest > RESUME_SPEED ? "moving" : null;
        }
        List<Fix> window = unbroken(at - Math.max(DWELL_MS, Math.round(2 * radius * 1000 / PAUSE_SPEED)), at);
        if (window == null) return null;
        Fix first = window.get(0);
        Fix last = window.get(window.size() - 1);
        double seconds = (last.timestamp - first.timestamp) / 1000.0;
        if (seconds <= 0) return null;
        float[] meters = new float[1];
        Location.distanceBetween(first.latitude, first.longitude, last.latitude, last.longitude, meters);
        double circle = Math.max(first.accuracy, last.accuracy);
        if ((meters[0] + circle) / seconds < PAUSE_SPEED) return "still";
        return Math.max(0, meters[0] - circle) / seconds > RESUME_SPEED ? "moving" : null;
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
        // Once: the ending's listener and its fallback both arrive here.
        if (stopped) return;
        stopped = true;
        handler.removeCallbacks(ticker);
        handler.removeCallbacks(stopper);
        if (locations != null) locations.removeUpdates(this);
        if (speech != null) { speech.stop(); speech.shutdown(); speech = null; }
        speaking = 0;
        said();
        if (aheadTone != null) { aheadTone.release(); aheadTone = null; }
        if (behindTone != null) { behindTone.release(); behindTone = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        active = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }
    @Override public void onDestroy() { if (active == this) fail(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
