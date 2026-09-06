package studio.getstronger.app;

import android.Manifest;
import android.content.Intent;
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
    private void command(PluginCall call, String action) {
        getActivity().runOnUiThread(() -> {
            try { TimedCircuitService.command(getContext(), call.getString("key"), action); call.resolve(); }
            catch (Exception error) { call.reject("Recording could not be updated", error); }
        });
    }
}
