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
        className="w-full px-4 py-3 rounded-lg border transition-colors duration-150 font-[family-name:var(--font-heading)] text-base placeholder:text-text-muted"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: focused ? "var(--color-accent)" : "var(--color-border)",
          outline: "none",
        }}
      />
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded border"
        style={{
          color: "var(--color-text-muted)",
          borderColor: "var(--color-border)",
        }}
      >
        ⌘K
      </div>
    </div>
  );
}
