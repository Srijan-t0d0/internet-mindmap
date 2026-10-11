"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ConnectAIPage() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setUrl(`${window.location.origin}/api/mcp`); }, []);
  const command = `claude mcp add --transport http internet-mindmap ${url}`;
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setError(""); }
    catch { setError("Clipboard unavailable. Select and copy the text below."); }
  }
  return <main className="flex-1 min-w-0 overflow-y-auto p-6 sm:p-10">
    <div className="max-w-xl space-y-6">
      <Link href="/" className="text-sm underline">Back to your knowledge base</Link>
      <h1 className="text-2xl font-semibold">Connect an AI</h1>
      <p>Search and read your saved pages from Claude, ChatGPT, Cursor, VS Code, or Raycast. OAuth connects your own account; no token to copy.</p>
      <section className="space-y-3">
        <h2 className="font-medium">MCP server URL</h2>
        <code className="block break-all rounded-lg border p-3 text-sm select-all">{url || "Loading URL…"}</code>
        <button disabled={!url} onClick={() => copy(url, "URL")} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{copied === "URL" ? "Copied URL" : "Copy URL"}</button>
        <p className="text-sm">Add this URL as a remote MCP connector in your AI client, then sign in and review the permissions.</p>
      </section>
      <section className="space-y-3">
        <h2 className="font-medium">Claude Code</h2>
        <code className="block break-all rounded-lg border p-3 text-sm select-all">{url ? command : "Loading command…"}</code>
        <button disabled={!url} onClick={() => copy(command, "command")} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{copied === "command" ? "Copied command" : "Copy command"}</button>
        <p className="text-sm">Run the command, open Claude Code, and use <code>/mcp</code> to authenticate.</p>
      </section>
      <p className="text-sm">Read access enables search and fetch. Write access also enables saving URLs and text you provide. Availability of write actions depends on your AI client and plan.</p>
      <p role="status" aria-live="polite" className="text-sm">{error || (copied ? `${copied} copied to clipboard.` : "")}</p>
    </div>
  </main>;
}
