export default function SidebarSkeleton() {
  return (
    <aside
      className="w-60 h-screen flex-shrink-0 border-r flex flex-col"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="p-6 pb-0">
        <h1
          className="font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Internet Mindmap
        </h1>
        <p className="text-xs mt-1 mb-6" style={{ color: "var(--color-text-muted)" }}>
          &nbsp;
        </p>
      </div>
      <nav className="flex-1 px-3 pb-6 space-y-2">
        <div className="h-8 rounded-md" style={{ backgroundColor: "var(--color-bg-card)", opacity: 0.4 }} />
        <div className="h-8 rounded-md" style={{ backgroundColor: "var(--color-bg-card)", opacity: 0.3 }} />
      </nav>
    </aside>
  );
}
