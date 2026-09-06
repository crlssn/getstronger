package studio.getstronger.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TimedCircuitPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
