package in.tinkercraft.tinkerspend;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import in.tinkercraft.tinkerspend.plugins.AuthBridgePlugin;
import in.tinkercraft.tinkerspend.plugins.CapturePlugin;
import in.tinkercraft.tinkerspend.plugins.RecorderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CapturePlugin.class);
        registerPlugin(AuthBridgePlugin.class);
        registerPlugin(RecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
