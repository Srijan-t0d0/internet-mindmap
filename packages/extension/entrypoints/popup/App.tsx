import { Kbd, KbdGroup } from "@internet-mindmap/ui";
import { useEffect, useRef, useState } from "react";
import { getApiKey, getUserEmail, setApiKey } from "../../lib/storage";

const API_BASE = import.meta.env.WXT_API_BASE as string;

function App() {
  const [hasKey, setHasKey] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Validate the stored token against the server on every popup open.
    // Without this, signing out from the web app (or a server-side session
    // expiry) leaves a stale token in chrome.storage.local and the popup
    // keeps claiming "Connected".
    (async () => {
      const k = await getApiKey();
      if (!k) return;
      try {
        const res = await fetch(`${API_BASE}/api/auth/get-session`, {
          headers: { Authorization: `Bearer ${k}` },
        });
        const session = res.ok ? await res.json().catch(() => null) : null;
        if (session?.user) {
          setHasKey(true);
        } else {
          // Token is dead — clear local state so the sign-in UI shows.
          await setApiKey("");
          setHasKey(false);
        }
      } catch {
        // Network failure — optimistically trust the cached token so the
        // user isn't falsely signed out when offline.
        setHasKey(true);
      }
    })();
    getUserEmail().then((e) => { if (e) setEmail(e); });

    // Listen for the content script completing auth in the background tab
    const onMessage = (msg: unknown) => {
      if ((msg as { type?: string }).type === "EXTENSION_AUTH_COMPLETE") {
        stopPolling();
        getApiKey().then((k) => {
          if (k) { setHasKey(true); setSuccess(true); setTimeout(() => setSuccess(false), 2000); }
          setSigning(false);
        });
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => { browser.runtime.onMessage.removeListener(onMessage); stopPolling(); };
  }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function handleSignIn() {
    setSigning(true);
    setError(null);

    // Tell the background script to open the OAuth tab.
    // The background drives the entire flow so it isn't killed by SW sleep.
    const res = await browser.runtime.sendMessage({ type: "START_OAUTH" }) as { ok: boolean; error?: string };
    if (!res.ok) {
      setSigning(false);
      setError(res.error ?? "Could not start sign-in");
      return;
    }

    // Poll storage as a fallback in case the EXTENSION_AUTH_COMPLETE message
    // is missed (e.g. popup was closed and reopened mid-flow)
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      const k = await getApiKey();
      if (k) {
        stopPolling();
        setHasKey(true);
        setSigning(false);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
        return;
      }
      if (attempts > 240) { // 2 min timeout
        stopPolling();
        setSigning(false);
        setError("Sign-in timed out. Please try again.");
      }
    }, 500);
  }

  async function handleCancel() {
    stopPolling();
    setSigning(false);
    await browser.runtime.sendMessage({ type: "CANCEL_OAUTH" });
  }

  async function handleSignOut() {
    stopPolling();
    // Revoke the session server-side so the bearer token stops working
    // everywhere (not just on this device). Fire-and-forget — we clear
    // local state regardless.
    const k = await getApiKey();
    if (k) {
      fetch(`${API_BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: { Authorization: `Bearer ${k}` },
      }).catch(() => {});
    }
    await setApiKey("");
    setHasKey(false);
    setSigning(false);
    setError(null);
  }

  const isMac = navigator.platform.includes("Mac");
  const quickKeys = isMac ? ["\u2318", "\u21e7", "S"] : ["Ctrl", "Shift", "S"];
  const notesKeys = isMac ? ["\u2318", "\u21e7", "X"] : ["Ctrl", "Shift", "X"];

  function redactEmail(addr: string): string {
    const [local, domain] = addr.split("@");
    if (!domain) return addr;
    const visible = local.length <= 2 ? local : local[0] + "•".repeat(local.length - 2) + local[local.length - 1];
    return `${visible}@${domain}`;
  }

  return (
    <div className="p-5 fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--color-accent)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2" /><circle cx="5" cy="6" r="1.5" /><circle cx="19" cy="6" r="1.5" />
            <circle cx="5" cy="18" r="1.5" /><circle cx="19" cy="18" r="1.5" />
            <line x1="10.5" y1="10.5" x2="6.2" y2="7.2" /><line x1="13.5" y1="10.5" x2="17.8" y2="7.2" />
            <line x1="10.5" y1="13.5" x2="6.2" y2="16.8" /><line x1="13.5" y1="13.5" x2="17.8" y2="16.8" />
          </svg>
        </div>
        <div>
          <h1 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--color-text-primary)" }}>Internet Mindmap</h1>
          <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--color-text-muted)" }}>Your personal knowledge graph</p>
        </div>
      </div>

      {/* Connected */}
      {hasKey && (
        <>
          {success ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-3 check-pop" style={{ backgroundColor: "rgba(74,158,107,0.06)", border: "1px solid rgba(74,158,107,0.12)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-success)" }}><polyline points="20 6 9 17 4 12" /></svg>
              <span className="text-xs font-medium" style={{ color: "var(--color-success)" }}>Signed in with Google</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-3" style={{ backgroundColor: "rgba(74,158,107,0.06)", border: "1px solid rgba(74,158,107,0.12)" }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--color-success)" }} />
              <span className="text-xs" style={{ color: "var(--color-success)" }}>
                {email ? redactEmail(email) : "Connected"}
              </span>
            </div>
          )}

          {/* Shortcuts */}
          <div className="rounded-lg px-3 mb-3" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Quick save</span>
              <KbdGroup className="gap-1">
                <Kbd className="h-5 min-w-5 px-1 text-[11px]">{quickKeys[0]}</Kbd><Kbd className="h-5 min-w-5 px-1 text-[11px]">{quickKeys[1]}</Kbd><Kbd className="h-5 min-w-5 px-1 text-[11px]">{quickKeys[2]}</Kbd>
              </KbdGroup>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
              <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Save with notes</span>
              <KbdGroup className="gap-1">
                <Kbd className="h-5 min-w-5 px-1 text-[11px]">{notesKeys[0]}</Kbd><Kbd className="h-5 min-w-5 px-1 text-[11px]">{notesKeys[1]}</Kbd><Kbd className="h-5 min-w-5 px-1 text-[11px]">{notesKeys[2]}</Kbd>
              </KbdGroup>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a href={API_BASE} target="_blank" rel="noopener noreferrer"
              className="flex-1 py-2 text-sm font-medium rounded-lg text-center transition-all duration-150 hover:scale-[0.99]"
              style={{ backgroundColor: "var(--color-accent)", color: "#fff", textDecoration: "none" }}>
              Dashboard
            </a>
            <button onClick={handleSignOut} className="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 hover:scale-[0.99]"
              style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
              Sign out
            </button>
          </div>
        </>
      )}

      {/* Not connected */}
      {!hasKey && (
        <>
          {error && (
            <div className="px-3 py-2.5 rounded-lg mb-4 text-xs" style={{ backgroundColor: "rgba(220,80,80,0.06)", border: "1px solid rgba(220,80,80,0.15)", color: "#dc5050" }}>
              {error}
            </div>
          )}

          {signing ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-4" style={{ backgroundColor: "rgba(196,149,106,0.06)", border: "1px solid rgba(196,149,106,0.15)" }}>
              <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Waiting for sign-in…</span>
              <button onClick={handleCancel} className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>Cancel</button>
            </div>
          ) : (
            <p className="text-xs mb-4 text-center" style={{ color: "var(--color-text-muted)" }}>
              Sign in to start saving pages to your knowledge graph.
            </p>
          )}

          <button onClick={handleSignIn} disabled={signing}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 hover:scale-[0.99] active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>
        </>
      )}
    </div>
  );
}

export default App;
