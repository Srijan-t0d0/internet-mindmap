export default function ItemsShellSkeleton() {
  return (
    <main
      className="flex-1 h-screen overflow-y-auto overflow-x-hidden p-6"
      role="main"
    >
      <div className="max-w-2xl mx-auto mb-8">
        <div
          className="h-11 rounded-md"
          style={{
            backgroundColor: "var(--color-bg-card)",
            opacity: 0.5,
          }}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl mx-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-lg"
            style={{
              backgroundColor: "var(--color-bg-card)",
              opacity: 0.4,
            }}
          />
        ))}
      </div>
    </main>
  );
}
