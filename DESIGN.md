# DESIGN.md — Internet Mindmap

## Design Direction

**Calm editorial.** A personal knowledge library, not a SaaS dashboard.
Warm neutrals, serif headings, generous whitespace. Think Are.na meets Notion.

## Colours

```
--bg-primary: #faf9f6          warm white
--bg-secondary: #f3f0eb        warm grey (sidebar, hover states)
--bg-card: #ffffff              card background
--text-primary: #2d2d2d        headings, body text
--text-secondary: #6b6b6b      secondary text, metadata
--text-muted: #a0a0a0          timestamps, placeholders
--accent: #c4956a              warm amber (links, active states, focus rings)
--accent-hover: #b8845a        accent hover state
--border: #e8e4de              card borders, dividers
--error: #d94f4f               error states
--success: #4a9e6b             success states

Source indicators (subtle, 6px dot):
--source-youtube: #ff0000
--source-reddit: #ff4500
--source-twitter: #000000
--source-github: #8b5cf6
--source-hackernews: #ff6600
--source-substack: #ff6719
--source-blog: #4a9eff
```

## Typography

```
--font-heading: 'Libre Baskerville', Georgia, serif
--font-body: 'Inter', system-ui, sans-serif
--font-mono: 'JetBrains Mono', monospace

Scale:
  Page title:    24px / 1.3 / 600 / serif
  Card title:    16px / 1.3 / 600 / serif
  Section head:  12px / 1.4 / 500 / sans / uppercase / letter-spacing 1px
  Body:          14px / 1.6 / 400 / sans
  Small:         12px / 1.4 / 400 / sans
  Tags:          12px / 1.4 / 500 / sans
  Mono:          13px / 1.5 / 400 / mono
```

## Spacing

```
Base unit: 8px

Card padding:      24px
Card gap:          16px
Sidebar width:     240px
Chat panel:        400px × 600px (floating, bottom-right)
Detail panel:      480px (slide-over, right side)
Page padding:      24px
Section gap:       24px
```

## Shadows

```
--shadow-card:       0 1px 3px rgba(0,0,0,0.06)
--shadow-card-hover: 0 4px 12px rgba(0,0,0,0.08)
--shadow-panel:      -4px 0 20px rgba(0,0,0,0.05)
```

## Border Radius

```
Cards:      8px
Tags:       12px (pill)
Buttons:    6px
Search bar: 8px
Avatars:    50% (round)
```

## Motion

```
Card hover:     transform translateY(-1px) + shadow transition, 150ms ease
Panel slide:    200ms ease-out (slide-over detail panel)
Search focus:   border-color transition, 150ms ease
Toast enter:    slideInRight 200ms ease-out
Toast exit:     fadeOut 150ms ease-in
Chat streaming: cursor blink 500ms
```

## Layout

Two-panel desktop layout (1280px+) with floating chat:
```
┌──────────┬────────────────────────────────┬──────────────────┐
│ Sidebar  │ Main Content                   │ Detail Panel     │
│ 240px    │ flex: 1                        │ 480px (optional) │
│ fixed    │ (cards / graph / list)         │                  │
└──────────┴────────────────────────────────┴──────────────────┘
                                        ┌──────────────────────┐
                                        │ Chat (floating)      │
                                        │ 400px × 600px        │
                                        │ bottom-right, z-50   │
                                        │ toggle: ⌘J / sidebar │
                                        └──────────────────────┘
```

Chat is a floating panel (not a view mode). It overlays content without
replacing it — you can browse items, read details, and chat simultaneously.

1024px-1279px: Detail panel opens as overlay.
Below 1024px: "Desktop recommended" message.

## Components

### Cards
- No visible border. Use shadow only.
- Source indicator: 6px coloured dot + source name in muted text.
- Tags: pill-shaped, border only (no fill), muted colour.
- Auto-tagged items get dashed border on tag pill.
- Hover: slight lift + shadow deepens.
- "Processing..." items: skeleton shimmer on summary area.

### Search Bar
- Visual focal point of the page.
- Warm background (#f3f0eb) with 1px border.
- Serif placeholder: "Search your knowledge..."
- ⌘K shortcut badge, right-aligned, muted.

### Chat Panel (Floating)
- Fixed position, bottom-right (20px inset), z-50.
- 400px wide, up to 600px tall, 16px border-radius.
- Subtle scrim (8% black) behind when open.
- Open/close: spring animation (scale + translateY), 250ms.
- Toggle via sidebar "Ask AI" button or ⌘J shortcut.
- Serif heading: "Ask your knowledge base"
- User messages: accent background, white text, right-aligned.
- AI messages: warm grey background, left-aligned.
- Streaming: three bouncing dots animation.
- Suggestion pills on empty state (italic serif quotes).
- Independent of DetailPanel — both can be open simultaneously.

### Empty States
- Warm, encouraging tone. Never generic.
- Icon or small illustration above message.
- Primary action button always present.

## Accessibility

- All text meets WCAG AA contrast (4.5:1).
- Focus ring: 2px solid accent colour on all interactive elements.
- Keyboard: ⌘K search, ⌘J toggle chat, Esc close panels, Tab through cards, Enter open detail.
- Screen reader: ARIA landmarks for sidebar, main, chat regions.
- Touch targets: 44px minimum (even on desktop, for trackpad users).
