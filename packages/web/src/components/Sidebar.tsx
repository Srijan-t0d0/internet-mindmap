import type { Tag, ViewMode } from "@internet-mindmap/shared";
import { SOURCE_TYPES, SOURCE_LABELS, SOURCE_CSS_COLORS } from "../lib/constants";

const SOURCE_FILTERS = SOURCE_TYPES
  .filter((key) => key !== "other")
  .map((key) => ({ key, label: SOURCE_LABELS[key], color: SOURCE_CSS_COLORS[key] }));

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "list", label: "List" },
  { key: "reading-list", label: "Reading List" },
  { key: "graph", label: "Graph" },
];

interface SidebarProps {
  tags: Tag[];
  viewMode: ViewMode;
  selectedSourceType: string | null;
  selectedTag: string | null;
  onViewModeChange: (mode: ViewMode) => void;
  onSourceTypeChange: (source: string | null) => void;
  onTagChange: (tag: string | null) => void;
  itemCount: number;
}

export default function Sidebar({
  tags,
  viewMode,
  selectedSourceType,
  selectedTag,
  onViewModeChange,
  onSourceTypeChange,
  onTagChange,
  itemCount,
}: SidebarProps) {
  return (
    <aside
      className="w-60 h-screen flex-shrink-0 overflow-y-auto p-6 border-r"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      <h1
        className="font-[family-name:var(--font-heading)] text-lg font-semibold mb-1"
        style={{ color: "var(--color-text-primary)" }}
      >
        Internet Mindmap
      </h1>
      <p className="text-xs mb-6" style={{ color: "var(--color-text-muted)" }}>
        {itemCount} items saved
      </p>

      {/* View modes */}
      <div className="mb-6">
        <h2
          className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          View
        </h2>
        <div className="space-y-1">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.key}
              onClick={() => onViewModeChange(mode.key)}
              className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors"
              style={{
                backgroundColor:
                  viewMode === mode.key ? "var(--color-bg-card)" : "transparent",
                color:
                  viewMode === mode.key
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                fontWeight: viewMode === mode.key ? 500 : 400,
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source filters */}
      <div className="mb-6">
        <h2
          className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sources
        </h2>
        <div className="space-y-1">
          <button
            onClick={() => onSourceTypeChange(null)}
            className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors"
            style={{
              backgroundColor: !selectedSourceType
                ? "var(--color-bg-card)"
                : "transparent",
              color: !selectedSourceType
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              fontWeight: !selectedSourceType ? 500 : 400,
            }}
          >
            All Sources
          </button>
          {SOURCE_FILTERS.map((source) => (
            <button
              key={source.key}
              onClick={() =>
                onSourceTypeChange(
                  selectedSourceType === source.key ? null : source.key
                )
              }
              className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
              style={{
                backgroundColor:
                  selectedSourceType === source.key
                    ? "var(--color-bg-card)"
                    : "transparent",
                color:
                  selectedSourceType === source.key
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                fontWeight: selectedSourceType === source.key ? 500 : 400,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: source.color }}
              />
              {source.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filters */}
      <div>
        <h2
          className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          Topics
        </h2>
        <div className="space-y-1">
          <button
            onClick={() => onTagChange(null)}
            className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors"
            style={{
              backgroundColor: !selectedTag
                ? "var(--color-bg-card)"
                : "transparent",
              color: !selectedTag
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              fontWeight: !selectedTag ? 500 : 400,
            }}
          >
            All Topics
          </button>
          {tags.slice(0, 20).map((tag) => (
            <button
              key={tag.id}
              onClick={() =>
                onTagChange(selectedTag === tag.name ? null : tag.name)
              }
              className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors flex items-center justify-between"
              style={{
                backgroundColor:
                  selectedTag === tag.name
                    ? "var(--color-bg-card)"
                    : "transparent",
                color:
                  selectedTag === tag.name
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                fontWeight: selectedTag === tag.name ? 500 : 400,
              }}
            >
              <span>{tag.name}</span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {tag.item_count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
