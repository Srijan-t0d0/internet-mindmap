"use client";

import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client";
import Link from "next/link";

export default function OAuthLoginPage() {
  const { data: session } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session || window.location.hash !== "#continue") return;
    let active = true;
    setBusy(true);
    fetch("/api/auth/oauth2/continue", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected: true, oauth_query: window.location.search.slice(1) }) })
      .then(async (response) => { const data = await response.json() as { url?: string }; if (!response.ok || typeof data.url !== "string") throw new Error(); return data.url; })
      .then((url) => { if (active) window.location.assign(url); })
      .catch(() => { if (active) { setError("This connection request expired. Start again from your AI client."); setBusy(false); } });
    return () => { active = false; };
  }, [session]);

  async function signIn() {
    setBusy(true); setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}${window.location.pathname}${window.location.search}#continue` });
      if (result.error) throw new Error();
    } catch { setError("Could not sign in. Please try again."); setBusy(false); }
  }
  return <main className="max-w-lg mx-auto p-6 mt-12 space-y-6">
    <Link href="/" className="text-sm underline">Internet Mindmap</Link>
    <h1 className="text-2xl font-semibold">Sign in to connect your AI</h1>
    <p>You will review the requested permissions before granting access.</p>
    {error && <p role="alert" style={{ color: "var(--color-error)" }}>{error}</p>}
    <button onClick={signIn} disabled={busy} className="rounded-lg px-4 py-2 disabled:opacity-50" style={{ background: "var(--color-accent)", color: "white" }}>{busy ? "Continuing…" : "Sign in with Google"}</button>
  </main>;
}
