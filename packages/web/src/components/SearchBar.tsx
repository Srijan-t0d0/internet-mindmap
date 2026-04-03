import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
}

export default function SearchBar({ value, onChange, onSearch }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && focused) {
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focused]);

  return (
    <div className="relative">
      <svg
        className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: focused ? "var(--color-accent)" : "var(--color-text-muted)" }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onSearch(value.trim());
          }
        }}
        placeholder="Search your knowledge..."
        className="w-full pl-11 pr-14 py-3 rounded-lg border transition-all duration-200 font-[family-name:var(--font-heading)] text-[15px] placeholder:text-text-muted"
        style={{
          backgroundColor: focused ? "var(--color-bg-card)" : "var(--color-bg-secondary)",
          borderColor: focused ? "var(--color-accent)" : "var(--color-border)",
          boxShadow: focused ? "var(--shadow-search-focus)" : "none",
          outline: "none",
        }}
      />
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] px-1.5 py-0.5 rounded transition-opacity duration-150"
        style={{
          color: "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
          opacity: focused ? 0 : 0.7,
        }}
      >
        <kbd>K</kbd>
      </div>
    </div>
  );
}
