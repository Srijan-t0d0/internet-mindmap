import { useState } from "react";
import { authClient } from "../lib/auth-client";

export default function UserMenu() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const { user } = session;
  const token = session.session.token;

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSignOut() {
    authClient.signOut().then(() => window.location.reload());
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors duration-150 text-left"
        style={{
          backgroundColor: open ? "var(--color-bg-card)" : "transparent",
          color: "var(--color-text-secondary)",
        }}
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name}
            className="w-6 h-6 rounded-full flex-shrink-0"
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: "var(--color-accent)", color: "white" }}
          >
            {user.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}
        <span className="text-xs truncate flex-1">{user.name || user.email}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Extension token */}
          <div className="p-3 border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
            <p
              className="text-[11px] font-medium uppercase tracking-widest mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Extension Token
            </p>
            {showToken ? (
              <div className="space-y-2">
                <div
                  className="px-2 py-1.5 rounded text-[11px] font-mono break-all"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    border: "1px solid var(--color-border-subtle)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {token}
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full py-1.5 text-xs font-medium rounded transition-all duration-150"
                  style={{
                    backgroundColor: copied ? "rgba(74, 158, 107, 0.1)" : "var(--color-bg)",
                    border: `1px solid ${copied ? "rgba(74, 158, 107, 0.3)" : "var(--color-border-subtle)"}`,
                    color: copied ? "var(--color-success)" : "var(--color-text-secondary)",
                  }}
                >
                  {copied ? "Copied!" : "Copy token"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowToken(true)}
                className="w-full py-1.5 text-xs font-medium rounded transition-all duration-150"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border-subtle)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Show token for extension
              </button>
            )}
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors duration-150"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--color-text-muted)";
            }}
          >
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
