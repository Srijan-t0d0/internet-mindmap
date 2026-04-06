import Link from "next/link";

export default function NotFound() {
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
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "48px",
            fontWeight: 400,
            color: "#e8e4de",
            marginBottom: "8px",
          }}
        >
          404
        </p>
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
          Page not found
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
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "14px",
            fontWeight: 500,
            color: "#c4956a",
            textDecoration: "none",
            borderBottom: "1px solid #c4956a",
            paddingBottom: "2px",
            transition: "color 0.15s ease, border-color 0.15s ease",
          }}
        >
          Back to your knowledge base
        </Link>
      </div>
    </div>
  );
}
