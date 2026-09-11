package studio.getstronger.app;

import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import androidx.core.view.WindowCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints everything outside the page in the palette the web app resolved.
 *
 * The strips the system bars sit on, and the WebView the page is drawn on. The
 * theme paints the bars too, but it can only ever follow the device: a reader
 * who picks a palette the phone does not ask for gets a band of the other one
 * at the foot of the app. Only the web app knows which palette is on. See
 * web/src/native/canvas.ts.
 */
@CapacitorPlugin(name = "Canvas")
public class CanvasPlugin extends Plugin {
    /** color-canvas in each palette, mirroring web/src/assets/theme.css. */
    private static final int CANVAS_LIGHT = Color.parseColor("#f2f1ed");
    private static final int CANVAS_DARK = Color.parseColor("#161512");

    @PluginMethod public void setTheme(PluginCall call) {
        boolean dark = "dark".equals(call.getString("theme"));
        int canvas = dark ? CANVAS_DARK : CANVAS_LIGHT;
        getActivity().runOnUiThread(() -> {
            // Capacitor leaves the WebView white, which is what an overscroll
            // pulls into view at either end of a dark page.
            getBridge().getWebView().setBackgroundColor(canvas);

            Window window = getActivity().getWindow();
            window.setStatusBarColor(canvas);
            window.setNavigationBarColor(canvas);
            // From Android 15 the colour above is ignored and the system draws
            // a scrim behind three-button navigation instead, which is the one
            // thing left that can darken the strip against a light app.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setNavigationBarContrastEnforced(false);
            }
            // The pill and the three buttons are the system's to draw, so the
            // canvas under them has to say which way round they go.
            WindowCompat.getInsetsController(window, window.getDecorView())
                .setAppearanceLightNavigationBars(!dark);
        });
        call.resolve();
    }
}
