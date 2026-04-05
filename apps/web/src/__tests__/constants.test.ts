import { describe, it, expect } from "vitest";
import {
  SOURCE_TYPES,
  SOURCE_LABELS,
  SOURCE_CSS_COLORS,
  SOURCE_HEX_COLORS,
} from "@internet-mindmap/ui";

describe("SOURCE constants completeness", () => {
  it("every SOURCE_TYPE has a label", () => {
    for (const type of SOURCE_TYPES) {
      expect(SOURCE_LABELS[type]).toBeDefined();
      expect(SOURCE_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it("every SOURCE_TYPE has a CSS colour", () => {
    for (const type of SOURCE_TYPES) {
      expect(SOURCE_CSS_COLORS[type]).toBeDefined();
      expect(SOURCE_CSS_COLORS[type].length).toBeGreaterThan(0);
    }
  });

  it("every SOURCE_TYPE has a hex colour", () => {
    for (const type of SOURCE_TYPES) {
      expect(SOURCE_HEX_COLORS[type]).toBeDefined();
      expect(SOURCE_HEX_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("CSS colours reference CSS variables (except other)", () => {
    for (const type of SOURCE_TYPES) {
      if (type === "other") {
        expect(SOURCE_CSS_COLORS[type]).toContain("var(--color-");
      } else {
        expect(SOURCE_CSS_COLORS[type]).toBe(`var(--color-source-${type})`);
      }
    }
  });
});
