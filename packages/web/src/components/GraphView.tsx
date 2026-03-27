import { useEffect, useRef, useState, useCallback } from "react";
import type { Item } from "@internet-mindmap/shared";

interface GraphNode {
  id: string;
  label: string;
  source_type: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: "tag" | "semantic";
}

const SOURCE_COLORS: Record<string, string> = {
  youtube: "#ff0000",
  reddit: "#ff4500",
  twitter: "#000000",
  blog: "#4a9eff",
  other: "#a0a0a0",
};

interface GraphViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

export default function GraphView({ items, onItemClick }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const animFrameRef = useRef<number>(0);

  const buildGraph = useCallback(() => {
    const readyItems = items.filter((i) => i.status === "ready");

    const nodes: GraphNode[] = readyItems.map((item) => ({
      id: item.id,
      label: item.title.slice(0, 40),
      source_type: item.source_type,
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx: 0,
      vy: 0,
    }));

    const links: GraphLink[] = [];
    for (let i = 0; i < readyItems.length; i++) {
      for (let j = i + 1; j < readyItems.length; j++) {
        const sharedTags = readyItems[i].tags.filter((t) =>
          readyItems[j].tags.includes(t)
        );
        if (sharedTags.length > 0) {
          links.push({
            source: readyItems[i].id,
            target: readyItems[j].id,
            type: "tag",
          });
        }
      }
    }

    nodesRef.current = nodes;
    linksRef.current = links;
  }, [items]);

  useEffect(() => {
    buildGraph();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 800;
    const height = canvas.parentElement?.clientHeight || 600;
    canvas.width = width;
    canvas.height = height;

    const centerX = width / 2;
    const centerY = height / 2;

    function simulate() {
      const nodes = nodesRef.current;
      const links = linksRef.current;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[j].x || 0) - (nodes[i].x || 0);
          const dy = (nodes[j].y || 0) - (nodes[i].y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 500 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx = (nodes[i].vx || 0) - fx;
          nodes[i].vy = (nodes[i].vy || 0) - fy;
          nodes[j].vx = (nodes[j].vx || 0) + fx;
          nodes[j].vy = (nodes[j].vy || 0) + fy;
        }
      }

      for (const link of links) {
        const source = nodes.find((n) => n.id === link.source);
        const target = nodes.find((n) => n.id === link.target);
        if (!source || !target) continue;
        const dx = (target.x || 0) - (source.x || 0);
        const dy = (target.y || 0) - (source.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx = (source.vx || 0) + fx;
        source.vy = (source.vy || 0) + fy;
        target.vx = (target.vx || 0) - fx;
        target.vy = (target.vy || 0) - fy;
      }

      for (const node of nodes) {
        node.vx = ((node.vx || 0) + (centerX - (node.x || 0)) * 0.001) * 0.9;
        node.vy = ((node.vy || 0) + (centerY - (node.y || 0)) * 0.001) * 0.9;
        node.x = (node.x || 0) + (node.vx || 0);
        node.y = (node.y || 0) + (node.vy || 0);
      }

      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = "#e8e4de";
      ctx.lineWidth = 1;
      for (const link of links) {
        const source = nodes.find((n) => n.id === link.source);
        const target = nodes.find((n) => n.id === link.target);
        if (!source || !target) continue;
        ctx.beginPath();
        ctx.moveTo(source.x || 0, source.y || 0);
        ctx.lineTo(target.x || 0, target.y || 0);
        ctx.stroke();
      }

      for (const node of nodes) {
        const isHovered = hoveredNode === node.id;
        const radius = isHovered ? 8 : 6;
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = SOURCE_COLORS[node.source_type] || "#a0a0a0";
        ctx.fill();

        if (isHovered) {
          ctx.font = "12px Inter, sans-serif";
          ctx.fillStyle = "#2d2d2d";
          ctx.fillText(node.label, (node.x || 0) + 12, (node.y || 0) + 4);
        }
      }

      animFrameRef.current = requestAnimationFrame(simulate);
    }

    simulate();

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: string | null = null;
      for (const node of nodesRef.current) {
        const dx = (node.x || 0) - mx;
        const dy = (node.y || 0) - my;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          found = node.id;
          break;
        }
      }
      setHoveredNode(found);
      canvas!.style.cursor = found ? "pointer" : "default";
    }

    function handleClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      for (const node of nodesRef.current) {
        const dx = (node.x || 0) - mx;
        const dy = (node.y || 0) - my;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          const item = items.find((i) => i.id === node.id);
          if (item) onItemClick(item);
          break;
        }
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
    };
  }, [buildGraph, items, onItemClick, hoveredNode]);

  if (items.filter((i) => i.status === "ready").length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Save some items to see the graph
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
