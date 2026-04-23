"use client";

interface FollowupChipsProps {
  questions: string[];
  onPick: (text: string) => void;
}

export default function FollowupChips({ questions, onPick }: FollowupChipsProps) {
  if (questions.length === 0) return null;
  return (
    <div className="mt-4">
      <div
        className="text-[11px] font-medium uppercase tracking-widest mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        Follow up
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onPick(q)}
            className="text-[12px] text-left px-3 py-2 rounded-lg border transition-all duration-150"
            style={{
              borderColor: "var(--color-border-subtle)",
              backgroundColor: "var(--color-bg-card)",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
