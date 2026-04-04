import type { Item } from "@internet-mindmap/shared";

export const MAX_GRAPH_NODES = 200;

export interface GraphNode {
  id: string;
  label: string;
  source_type: string;
  tags: string[];
}

export interface GraphLink {
  source: string;
  target: string;
  sharedTags: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  totalReady: number;
  capped: boolean;
}

/** Pure function — builds graph nodes + links from items */
export function buildGraphData(items: Item[]): GraphData {
  const readyItems = items.filter((i) => i.status === "ready");
  const totalReady = readyItems.length;

  // Sort by tag count descending, take top MAX_GRAPH_NODES
  const sorted = [...readyItems].sort((a, b) => b.tags.length - a.tags.length);
  const capped = sorted.length > MAX_GRAPH_NODES;
  const displayed = capped ? sorted.slice(0, MAX_GRAPH_NODES) : sorted;

  const nodes: GraphNode[] = displayed.map((item) => ({
    id: item.id,
    label: item.title.length > 50 ? item.title.slice(0, 50) + "\u2026" : item.title,
    source_type: item.source_type,
    tags: item.tags,
  }));

  const links: GraphLink[] = [];
  for (let i = 0; i < displayed.length; i++) {
    for (let j = i + 1; j < displayed.length; j++) {
      const shared = displayed[i].tags.filter((t) =>
        displayed[j].tags.includes(t)
      );
      if (shared.length > 0) {
        links.push({
          source: displayed[i].id,
          target: displayed[j].id,
          sharedTags: shared.length,
        });
      }
    }
  }

  return { nodes, links, totalReady, capped };
}
