import { useState, useEffect } from "react";
import { getApiToken } from "../../lib/storage";

function App() {
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    getApiToken().then((stored) => {
      if (stored) setHasToken(true);
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2" />
            <circle cx="5" cy="6" r="1.5" />
            <circle cx="19" cy="18" r="1.5" />
            <line x1="10.5" y1="10.5" x2="6.2" y2="7.2" />
            <line x1="13.5" y1="13.5" x2="17.8" y2="16.8" />
          </svg>
        </div>
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Internet Mindmap
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center fade-in">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: "var(--color-bg-secondary)" }}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--color-text-muted)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        <h2
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          Knowledge Search
        </h2>
        <p
          className="text-sm leading-relaxed max-w-[220px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Search across your saved content will be available here soon.
        </p>

        {!hasToken && (
          <p
            className="text-xs mt-4"
            style={{ color: "var(--color-text-muted)" }}
          >
            Set up your API token in the popup to get started.
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
