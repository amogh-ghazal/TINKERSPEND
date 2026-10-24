export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_ENV: string;
  ALLOWED_ORIGINS: string;
  GOOGLE_WEB_CLIENT_ID: string;
  OPENAI_API_KEY?: string;
  OPENAI_TRANSCRIBE_MODEL: string;
  OPENAI_EXTRACT_MODEL: string;
  OPENAI_CATEGORY_MODEL?: string;
  AI_USER_CLASSIFY_LIMIT?: string;
  AI_USER_TEXT_LIMIT?: string;
  AI_USER_VOICE_LIMIT?: string;
  AI_DAILY_GLOBAL_LIMIT: string;
  SESSION_DAYS: string;
  /** Test-only: replaces Google JWKS verification. Never set in deployed environments. */
  TEST_ID_TOKEN_VERIFIER?: string;
}

export interface AuthedUser {
  id: string;
  email: string;
  timezone: string;
  sessionHash: string;
  client: "web" | "android";
  deviceId: string | null;
  aiEnabled: boolean;
  dailyAiLimit: number;
}

export type AppVars = { Variables: { user: AuthedUser; requestId: string }; Bindings: Env };
