package studio.getstronger.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "TimedCircuit", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class TimedCircuitPlugin extends Plugin {
    /** The engine the settings examples are said by, outside any recording. */
    private TextToSpeech examples;
    private boolean exampleReady;
    /** The example that asked for the engine, waiting for it to come up. */
    private Runnable pending;
    @PluginMethod public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermission");
        } else { begin(call); }
    }
    @PermissionCallback private void locationPermission(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission denied", "LOCATION_DENIED");
        } else { begin(call); }
    }
    private void begin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                TimedCircuitService.prepare(getContext(), call.getData());
                ContextCompat.startForegroundService(getContext(), new Intent(getContext(), TimedCircuitService.class));
                call.resolve();
            } catch (Exception error) { call.reject("Recording could not start", error); }
        });
    }
    @PluginMethod public void read(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { call.resolve(new JSObject(TimedCircuitService.read(getContext(), call.getString("key")).toString())); }
            catch (Exception error) { call.reject("Recording could not be read", error); }
        });
    }
    @PluginMethod public void pause(PluginCall call) { command(call, "pause"); }
    @PluginMethod public void resume(PluginCall call) { command(call, "resume"); }
    @PluginMethod public void finish(PluginCall call) { command(call, "finish"); }
    @PluginMethod public void clear(PluginCall call) { command(call, "clear"); }
    @PluginMethod public void setVolume(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                TimedCircuitService.setVolume(getContext(), call.getString("key"), call.getDouble("volume", 1d));
                call.resolve();
            } catch (Exception error) { call.reject("Recording could not be updated", error); }
        });
    }
    /**
     * Says one phrase in the best voice the phone has, outside any recording.
     *
     * The settings screens play an example of what a run will sound like, and
     * the voice is the whole point of it — so it is said here rather than by
     * the page, which the WebView hands a different set of voices from the app
     * around it.
     */
    @PluginMethod public void speak(PluginCall call) {
        String phrase = call.getString("phrase", "");
        Double volume = call.getDouble("volume", 1d);
        String locale = call.getString("locale", "en");
        if (phrase == null || phrase.isEmpty() || volume == null || volume <= 0) { call.resolve(); return; }
        getActivity().runOnUiThread(() -> {
            try {
                if (examples == null) start();
                // An engine takes a moment to come up, and the phrase that
                // started it is the first one anybody asked for: it waits
                // rather than being swallowed.
                if (exampleReady) say(phrase, volume, locale);
                else pending = () -> say(phrase, volume, locale);
                call.resolve();
            } catch (Exception error) { call.reject("The example could not be said", error); }
        });
    }
    /** Started on the first example rather than with the app: an engine nobody asks for is memory nobody needed. */
    private void start() {
        examples = new TextToSpeech(getContext(), status -> getActivity().runOnUiThread(() -> {
            exampleReady = status == TextToSpeech.SUCCESS;
            Runnable waiting = pending;
            pending = null;
            if (exampleReady && waiting != null) waiting.run();
        }));
    }
    private void say(String phrase, double volume, String locale) {
        AnnouncementVoice.choose(examples, locale);
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) volume);
        // Flushed, so a second tap replaces the first rather than queueing
        // behind it.
        examples.speak(AnnouncementVoice.phrase(phrase), TextToSpeech.QUEUE_FLUSH, params, "example");
    }
    @Override protected void handleOnDestroy() {
        if (examples != null) { examples.stop(); examples.shutdown(); examples = null; }
        exampleReady = false;
        pending = null;
        super.handleOnDestroy();
    }
    private void command(PluginCall call, String action) {
        getActivity().runOnUiThread(() -> {
            try { TimedCircuitService.command(getContext(), call.getString("key"), action); call.resolve(); }
            catch (Exception error) { call.reject("Recording could not be updated", error); }
        });
    }
}
