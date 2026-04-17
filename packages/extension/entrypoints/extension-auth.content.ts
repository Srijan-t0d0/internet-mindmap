import { setApiKey } from "../lib/storage";

// Matches *://*/extension-auth and *://*/extension-auth?* etc.
export default defineContentScript({
  matches: ["*://*/extension-auth", "*://*/extension-auth?*"],
  runAt: "document_start",
  async main() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get("token");

    if (token) {
      await setApiKey(token);
      // Notify any open popup that auth is complete
      browser.runtime.sendMessage({ type: "EXTENSION_AUTH_COMPLETE" }).catch(() => {
        // Popup might not be open — that's fine
      });
    }

    // Clean up: remove the token from the URL and show a simple done message
    history.replaceState(null, "", location.pathname);
    document.documentElement.innerHTML = `
      <html><head><title>Internet Mindmap</title></head>
      <body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#faf9f7">
        <div style="text-align:center">
          ${token
            ? `<p style="font-size:1.1rem;color:#4a9e6b;font-weight:500">✓ Successful! You can close this page now.</p>
               <p style="color:#888;font-size:.9rem">Your extension is signed in and ready.</p>`
            : `<p style="font-size:1.1rem;color:#dc5050;font-weight:500">Authentication failed</p>
               <p style="color:#888;font-size:.9rem">Please try again from the extension.</p>`
          }
        </div>
      </body></html>
    `;
  },
});
