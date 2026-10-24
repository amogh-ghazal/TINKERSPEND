import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.tinkercraft.tinkerspend",
  appName: "TinkerSpend",
  webDir: "dist-native",
  // Bundled assets only. No production server.url (never load remote JS into the native bridge).
  android: { allowMixedContent: false, captureInput: false, webContentsDebuggingEnabled: false },
};

export default config;
