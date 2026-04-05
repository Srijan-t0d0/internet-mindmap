"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Item } from "@internet-mindmap/shared";
import { SOURCE_HEX_COLORS, SOURCE_LABELS } from "@internet-mindmap/ui";
import { buildGraphData, MAX_GRAPH_NODES } from "../lib/graph-data";

interface GraphViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

export default function GraphView({ items, onItemClick }: GraphViewProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => buildGraphData(items), [items]);

  const handleNodeClick = useCallback(
    (node: any) => {
      const item = items.find((i) => i.id === node.id);
      if (item) onItemClick(item);
    },
    [items, onItemClick]
  );

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label as string;
      const fontSize = 11 / globalScale;
      const radius = 5 / globalScale;
      const color = SOURCE_HEX_COLORS[node.source_type] || "#a0a0a0";

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (globalScale > 0.8) {
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#2d2d2d";
        ctx.fillText(label, node.x, node.y + radius + 2 / globalScale);
      }
    },
    []
  );

  const nodePointerAreaPaint = useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const radius = 8 / globalScale;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  // Collect unique source types present in the graph for the legend
  const legendEntries = useMemo(() => {
    const types = new Set(graphData.nodes.map((n) => n.source_type));
    return Array.from(types).map((type) => ({
      type,
      label: SOURCE_LABELS[type] || type,
      color: SOURCE_HEX_COLORS[type] || "#a0a0a0",
    }));
  }, [graphData.nodes]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Save some items to see the graph
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ overflow: "hidden" }}
      role="img"
      aria-label={`Knowledge graph showing ${graphData.nodes.length} items connected by shared tags`}
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeId="id"
        nodeLabel="label"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        onNodeClick={handleNodeClick}
        linkColor={() => "#e8e4de"}
        linkWidth={(link: any) => Math.min(link.sharedTags, 3)}
        linkDirectionalParticles={0}
        backgroundColor="#faf9f6"
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        enableNodeDrag={true}
      />

      {/* Source type legend */}
      <div
        className="absolute bottom-4 left-4 flex flex-col gap-1.5 px-3 py-2 rounded-lg"
        style={{
          backgroundColor: "rgba(250, 249, 246, 0.9)",
          border: "1px solid var(--color-border)",
        }}
      >
        {legendEntries.map((entry) => (
          <div key={entry.type} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {entry.label}
            </span>
          </div>
        ))}
      </div>

      {/* Cap indicator */}
      {graphData.capped && (
        <div
          className="absolute top-4 right-4 text-xs px-2 py-1 rounded"
          style={{
            color: "var(--color-text-muted)",
            backgroundColor: "rgba(250, 249, 246, 0.9)",
            border: "1px solid var(--color-border)",
          }}
        >
          Showing {MAX_GRAPH_NODES} of {graphData.totalReady} items
        </div>
      )}
    </div>
  );
}
