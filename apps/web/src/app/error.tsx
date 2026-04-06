"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#faf9f6",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "440px" }}>
        <h1
          style={{
            fontFamily: "'Libre Baskerville', Georgia, serif",
            fontSize: "24px",
            fontWeight: 600,
            lineHeight: 1.3,
            color: "#2d2d2d",
            marginBottom: "12px",
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "14px",
            lineHeight: 1.6,
            color: "#6b6b6b",
            marginBottom: "24px",
          }}
        >
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "14px",
            fontWeight: 500,
            color: "#ffffff",
            backgroundColor: "#c4956a",
            border: "none",
            borderRadius: "6px",
            padding: "10px 24px",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          onMouseOver={(e) =>
            ((e.target as HTMLButtonElement).style.backgroundColor = "#b8845a")
          }
          onMouseOut={(e) =>
            ((e.target as HTMLButtonElement).style.backgroundColor = "#c4956a")
          }
        >
          Try again
        </button>
        {error.digest && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
              color: "#a0a0a0",
              marginTop: "16px",
            }}
          >
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
