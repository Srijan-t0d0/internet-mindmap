"use client";

import { useEffect, useState } from "react";

type State = "connecting" | "success" | "error" | "no-extension";

/**
 * Landing page for the extension OAuth flow.
 *
 * The OAuth callback on the Worker redirects here with #token=<bearer> in
 * the URL hash. The extension's extension-auth content script matches any
 * URL ending in /extension-auth, fires at document_start, grabs the token
 * from the hash, and rewrites the entire DOM to show its own success message.
 *
 * If the content script fires, this React tree is torn down before the user
 * sees it — the page they end up looking at comes from the content script.
 *
 * If the extension isn't installed (or was disabled), this page renders
 * instead and tells them what to do. We also show a friendly success message
 * if we can see a token in the hash, because the user definitely completed
 * OAuth to get here.
 */
export default function ExtensionAuthPage() {
  const [state, setState] = useState<State>("connecting");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hasToken = !!hash.get("token");
    const hasError = !!hash.get("error");

    if (hasError) {
      setState("error");
      return;
    }

    if (hasToken) {
      // The content script fires at document_start — if it was going to run,
      // it would've replaced the DOM already. If we're still here, the
      // extension probably isn't installed. Give it one more beat for slow
      // machines, then show the success message (they did complete OAuth).
      const t = setTimeout(() => setState("success"), 400);
      return () => clearTimeout(t);
    }

    // No hash at all — someone visited this URL directly.
    setState("no-extension");
  }, []);

  const baseStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf9f6",
    padding: "24px",
  };

  const wrapperStyle: React.CSSProperties = {
    textAlign: "center",
    maxWidth: "440px",
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "'Libre Baskerville', Georgia, serif",
    fontSize: "24px",
    fontWeight: 600,
    lineHeight: 1.3,
    color: "#2d2d2d",
    marginBottom: "12px",
  };

  const bodyStyle: React.CSSProperties = {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#6b6b6b",
  };

  if (state === "connecting") {
    return (
      <div style={baseStyle}>
        <div style={wrapperStyle}>
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              margin: "0 auto 16px",
              borderRadius: "50%",
              border: "2px solid #e8e4de",
              borderTopColor: "#c4956a",
              animation: "immspin 0.7s linear infinite",
            }}
          />
          <h1 style={titleStyle}>Connecting your extension…</h1>
          <p style={bodyStyle}>Hang tight — this takes a second.</p>
          <style
            dangerouslySetInnerHTML={{
              __html: "@keyframes immspin { to { transform: rotate(360deg) } }",
            }}
          />
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div style={baseStyle}>
        <div style={wrapperStyle}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              margin: "0 auto 16px",
              borderRadius: "50%",
              backgroundColor: "rgba(74,158,107,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a9e6b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={titleStyle}>Successful! You can close this page now.</h1>
          <p style={bodyStyle}>
            Your extension is signed in and ready. Use{" "}
            <kbd
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
                padding: "2px 6px",
                backgroundColor: "#f2eee8",
                border: "1px solid #e8e4de",
                borderRadius: "4px",
                color: "#2d2d2d",
              }}
            >
              ⌘⇧S
            </kbd>{" "}
            on any page to save it.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div style={baseStyle}>
        <div style={wrapperStyle}>
          <h1 style={titleStyle}>Sign-in failed</h1>
          <p style={bodyStyle}>
            Something went wrong completing the sign-in. Please open the
            extension popup and try again.
          </p>
        </div>
      </div>
    );
  }

  // no-extension
  return (
    <div style={baseStyle}>
      <div style={wrapperStyle}>
        <h1 style={titleStyle}>Extension not detected</h1>
        <p style={bodyStyle}>
          This page is the handoff for the Internet Mindmap browser extension.
          Make sure the extension is installed and enabled, then open its popup
          to sign in.
        </p>
      </div>
    </div>
  );
}
