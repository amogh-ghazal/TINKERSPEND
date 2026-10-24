import { api } from "./api";
import { AuthBridge, isNative } from "../native";
import type { Me } from "./types";

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;

interface Challenge { challenge_id: string; nonce: string }
interface Gsi { accounts: { id: { initialize(o: object): void; prompt(cb?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void; renderButton(el: HTMLElement, o: object): void; disableAutoSelect(): void } } }

export async function currentUser(): Promise<Me | null> {
  if (isNative) { const s = await AuthBridge.hasSession(); if (!s.signedIn) return null; }
  try { return (await api<{ user: Me }>("GET", "/me")).user; } catch { return null; }
}

export async function signInNative(): Promise<Me> {
  // Challenge, Credential Manager and token storage all happen natively; JS only receives the public user profile.
  return (await AuthBridge.signIn()).user;
}

function loadGsi(): Promise<Gsi> {
  const w = window as unknown as { google?: Gsi };
  if (w.google) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("Google sign-in failed to load")));
    s.onerror = () => reject(new Error("Google sign-in failed to load"));
    document.head.appendChild(s);
  });
}

/** Renders the Google button; resolves with the signed-in user after the backend verifies the nonce-bound ID token. */
export async function renderWebSignIn(el: HTMLElement, onUser: (u: Me) => void, onError: (m: string) => void): Promise<void> {
  if (!WEB_CLIENT_ID) { onError("Google sign-in is not configured (VITE_GOOGLE_WEB_CLIENT_ID)."); return; }
  const g = await loadGsi();
  const ch = await api<Challenge>("POST", "/auth/challenge", { client: "web" });
  g.accounts.id.initialize({
    client_id: WEB_CLIENT_ID, nonce: ch.nonce, auto_select: false, use_fedcm_for_prompt: true,
    callback: async (resp: { credential: string }) => {
      try { onUser((await api<{ user: Me }>("POST", "/auth/google", { challenge_id: ch.challenge_id, id_token: resp.credential, client: "web" })).user); }
      catch (e) { onError((e as Error).message); }
    },
  });
  g.accounts.id.renderButton(el, { theme: "outline", size: "large", text: "signin_with" });
}

export async function signOut(purgePending = false): Promise<void> {
  try { await api("POST", "/auth/logout", {}); } catch { /* session may already be gone */ }
  if (isNative) await AuthBridge.clearSession({ purgePending });
  else { const w = window as unknown as { google?: Gsi }; w.google?.accounts.id.disableAutoSelect(); }
}
