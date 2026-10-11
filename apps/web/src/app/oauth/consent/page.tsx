"use client";

import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client";
import Link from "next/link";

const labels: Record<string, string> = {
  "kb:read": "Search and read your saved pages", "kb:write": "Add or update saved pages",
  offline_access: "Stay connected until you revoke access", openid: "Identify your account",
  profile: "Read your name and profile", email: "Read your email address",
};

export default function ConsentPage() {
  const { data: session, isPending } = authClient.useSession();
  const [clientName, setClientName] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [claims, setClaims] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const clientId = query.get("client_id");
    if (!clientId) { setError("This connection request is incomplete. Start again from your AI client."); return; }
    setScopes((query.get("scope") ?? "").split(" ").filter(Boolean));
    try { setClaims(Object.keys(JSON.parse(query.get("claims") ?? "{}").userinfo ?? {})); } catch { setError("Invalid connection request."); return; }
    const controller = new AbortController();
    // This endpoint verifies the signed OAuth query before displaying client information.
    fetch("/api/auth/oauth2/public-client-prelogin", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, oauth_query: window.location.search.slice(1) }), signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ name?: string }>; })
      .then((client) => setClientName(typeof client.name === "string" && client.name ? client.name : "Unnamed AI client"))
      .catch(() => { if (!controller.signal.aborted) setError("This connection request is invalid or expired. Start again from your AI client."); });
    return () => controller.abort();
  }, []);

  async function consent(accept: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/oauth2/consent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: window.location.search.slice(1) }) });
      const data = await response.json() as { url?: string };
      if (!response.ok || typeof data.url !== "string") throw new Error();
      // Redirect is returned by the authorization server, not read from the query.
      window.location.assign(data.url);
    } catch { setError("Could not finish connecting. Try again from your AI client."); setBusy(false); }
  }

  return <main className="max-w-lg mx-auto p-6 mt-12 space-y-6">
    <Link href="/" className="text-sm underline">Internet Mindmap</Link>
    <h1 className="text-2xl font-semibold">Connect {clientName ?? "your AI client"}</h1>
    <p>This client is requesting access to your account. Only approve clients you trust.</p>
    <ul className="list-disc pl-5 space-y-2">{scopes.map((scope) => <li key={scope}>{labels[scope] ?? scope}</li>)}</ul>
    {claims.length > 0 && <p>Requested profile fields: {claims.join(", ")}</p>}
    {error && <p role="alert" style={{ color: "var(--color-error)" }}>{error}</p>}
    {isPending ? <p role="status">Checking your account…</p> : session ? <>
      <p className="text-sm">Signed in as {session.user.email}</p>
      <div className="flex gap-3">
        <button disabled={busy || !clientName} onClick={() => consent(true)} className="rounded-lg px-4 py-2 disabled:opacity-50" style={{ background: "var(--color-accent)", color: "white" }}>{busy ? "Connecting…" : "Approve"}</button>
        <button disabled={busy || !clientName} onClick={() => consent(false)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Deny</button>
      </div>
    </> : <Link className="underline" href={`/oauth/login${typeof window === "undefined" ? "" : window.location.search}`}>Sign in to continue</Link>}
  </main>;
}
