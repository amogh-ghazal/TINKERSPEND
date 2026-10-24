import { Capacitor, registerPlugin } from "@capacitor/core";

export interface CaptureStatus {
  permissionGranted: boolean;
  listenerConnected: boolean;
  lastListenerConnectAt: number | null;
  lastEventAt: number | null;
  lastSyncAt: number | null;
  pendingCount: number;
  failedCount: number;
  captureEnabled: boolean;
  boundUser: string | null;
  selectedPackages: string[];
  outboxBytes: number;
  outboxLimitBytes: number;
  pausedReason: string | null;
}

export interface CapturedEventSummary {
  eventId: string;
  sourcePackage: string;
  capturedAt: number;
  state: string;
  preview: string;
}

export interface InstalledSource { packageName: string; label: string; installed: boolean }

export interface CapturePlugin {
  getStatus(): Promise<CaptureStatus>;
  openNotificationAccessSettings(): Promise<void>;
  setCaptureEnabled(o: { enabled: boolean }): Promise<CaptureStatus>;
  setSelectedPackages(o: { packages: string[] }): Promise<CaptureStatus>;
  listSupportedSources(): Promise<{ sources: InstalledSource[] }>;
  recentEvents(o: { limit: number }): Promise<{ events: CapturedEventSummary[] }>;
  syncNow(): Promise<void>;
  importActiveNotifications(): Promise<{ imported: number }>;
  deletePending(o: { confirm: boolean }): Promise<{ deleted: number }>;
}

export interface AuthBridgePlugin {
  signIn(): Promise<{ user: { id: string; email: string; timezone: string } }>;
  pendingForOtherAccounts(): Promise<{ count: number }>;
  clearSession(o: { purgePending: boolean }): Promise<void>;
  hasSession(): Promise<{ signedIn: boolean; userId: string | null; expiresAt: number | null }>;
  getInstallId(): Promise<{ installId: string }>;
  request(o: { method: string; path: string; body?: string }): Promise<{ status: number; body: string }>;
}

export interface RecorderPlugin {
  start(): Promise<void>;
  stop(): Promise<{ base64: string; mimeType: string; durationMs: number }>;
  cancel(): Promise<void>;
}

export const isNative = Capacitor.isNativePlatform();
export const Capture = registerPlugin<CapturePlugin>("Capture");
export const AuthBridge = registerPlugin<AuthBridgePlugin>("AuthBridge");
export const Recorder = registerPlugin<RecorderPlugin>("Recorder");
