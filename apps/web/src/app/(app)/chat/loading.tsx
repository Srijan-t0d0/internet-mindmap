export default function Loading() {
  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
          <div
            className="h-16 rounded-lg"
            style={{
              backgroundColor: "var(--color-bg-card)",
              opacity: 0.4,
            }}
          />
          <div
            className="h-24 rounded-lg"
            style={{
              backgroundColor: "var(--color-bg-card)",
              opacity: 0.3,
            }}
          />
        </div>
      </div>
      <div className="border-t p-4" style={{ borderColor: "var(--color-border-subtle)" }}>
        <div
          className="h-11 rounded-md max-w-2xl mx-auto"
          style={{
            backgroundColor: "var(--color-bg-card)",
            opacity: 0.5,
          }}
        />
      </div>
    </div>
  );
}
