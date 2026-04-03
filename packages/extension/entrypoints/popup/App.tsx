import { useState, useEffect } from "react";
import { getApiToken, setApiToken } from "../../lib/storage";

function App() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    getApiToken().then((stored) => {
      if (stored) {
        setToken(stored);
        setHasToken(true);
      }
    });
  }, []);

  const handleSave = async () => {
    await setApiToken(token.trim());
    setHasToken(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const shortcut = navigator.platform.includes("Mac") ? "\u2318\u21e7S" : "Ctrl+Shift+S";

  return (
    <div className="p-5 fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2" />
            <circle cx="5" cy="6" r="1.5" />
            <circle cx="19" cy="6" r="1.5" />
            <circle cx="5" cy="18" r="1.5" />
            <circle cx="19" cy="18" r="1.5" />
            <line x1="10.5" y1="10.5" x2="6.2" y2="7.2" />
            <line x1="13.5" y1="10.5" x2="17.8" y2="7.2" />
            <line x1="10.5" y1="13.5" x2="6.2" y2="16.8" />
            <line x1="13.5" y1="13.5" x2="17.8" y2="16.8" />
          </svg>
        </div>
        <div>
          <h1
            className="text-[15px] font-semibold leading-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Internet Mindmap
          </h1>
          <p
            className="text-[11px] leading-tight mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            Your personal knowledge graph
          </p>
        </div>
      </div>

      {/* Connection status */}
      {hasToken && !saved && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-4"
          style={{
            backgroundColor: "rgba(74, 158, 107, 0.06)",
            border: "1px solid rgba(74, 158, 107, 0.12)",
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: "var(--color-success)" }}
          />
          <span className="text-xs" style={{ color: "var(--color-success)" }}>
            Connected
          </span>
          <span className="text-xs ml-auto" style={{ color: "var(--color-text-muted)" }}>
            Press <kbd className="font-medium" style={{ color: "var(--color-text-secondary)" }}>{shortcut}</kbd> to save
          </span>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-4 check-pop"
          style={{
            backgroundColor: "rgba(74, 158, 107, 0.06)",
            border: "1px solid rgba(74, 158, 107, 0.12)",
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--color-success)" }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-xs font-medium" style={{ color: "var(--color-success)" }}>
            Token saved
          </span>
        </div>
      )}

      {/* Token input */}
      <div className="mb-4">
        <label
          className="block text-[11px] font-medium uppercase tracking-widest mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          API Token
        </label>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && token.trim()) handleSave();
            }}
            placeholder="Enter your API token"
            className="w-full px-3 py-2 pr-9 text-sm rounded-lg border transition-all duration-150"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196, 149, 106, 0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors duration-150"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
            }}
            aria-label={showToken ? "Hide token" : "Show token"}
          >
            {showToken ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!token.trim()}
        className="w-full py-2 text-sm font-medium text-white rounded-lg transition-all duration-150 hover:scale-[0.99] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
        style={{ backgroundColor: "var(--color-accent)" }}
        onMouseEnter={(e) => {
          if (token.trim()) e.currentTarget.style.backgroundColor = "var(--color-accent-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-accent)";
        }}
      >
        {hasToken ? "Update Token" : "Save Token"}
      </button>

      {/* Footer hint */}
      {!hasToken && (
        <p
          className="text-[11px] text-center mt-3 leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          Enter your API token to start saving pages.
        </p>
      )}
    </div>
  );
}

export default App;
