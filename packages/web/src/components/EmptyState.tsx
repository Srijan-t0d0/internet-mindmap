interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center fade-in">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-subtle)",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-text-muted)" }}
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          <path d="M8 7h6" />
          <path d="M8 11h4" />
        </svg>
      </div>
      <h3
        className="font-[family-name:var(--font-heading)] text-base font-semibold mb-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        {title}
      </h3>
      <p
        className="text-sm max-w-xs leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 text-sm font-medium px-5 py-2 rounded-md text-white transition-all duration-150 hover:scale-[0.98] active:scale-[0.96]"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
