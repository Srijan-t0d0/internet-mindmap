"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronUp, LogOut } from "lucide-react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@internet-mindmap/ui";
import { authClient } from "../lib/auth-client";
import { fetchUsage } from "../lib/api";

const LABELS: Record<string, string> = {
  save: "Articles saved",
  chat: "Chats",
  embedding: "Embeddings",
  tagging: "Auto-tags",
  mcp_call: "MCP calls",
  tool_call: "Tool calls",
  agent_api: "Agent queries",
  search: "Searches",
  import: "Imports",
};

function formatTokens(n: number): string {
  if (n < 1000) return n < 1 ? "0" : `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function labelFor(type: string): string {
  return LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function UserMenu() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);

  const { data: usage, isError: usageError } = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
    enabled: open,
    staleTime: 30 * 1000,
  });

  if (!session) return null;

  const { user } = session;
  function handleSignOut() {
    authClient.signOut().then(() => window.location.reload());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors duration-150 text-left"
          style={{
            backgroundColor: open ? "var(--color-bg-card)" : "transparent",
            color: "var(--color-text-secondary)",
          }}
        >
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="w-6 h-6 rounded-full flex-shrink-0"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
              style={{ backgroundColor: "var(--color-accent)", color: "white" }}
            >
              {user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )}
          <span className="text-xs truncate flex-1">{user.name || user.email}</span>
          <ChevronUp
            className={`size-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-0 rounded-lg"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <Link href="/settings/connect" onClick={() => setOpen(false)}
          className="block p-3 text-xs underline border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
          Connect an AI
        </Link>

        {/* Usage stats */}
        <div className="p-3 border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
          <p
            className="text-[11px] font-medium uppercase tracking-widest mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Usage
          </p>
          {usageError ? (
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Failed to load usage
            </p>
          ) : !usage ? (
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              &mdash;
            </p>
          ) : (
            <div className="space-y-1.5">
              <div
                className="flex items-center justify-between px-2 py-1 rounded text-[11px]"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                <span style={{ color: "var(--color-text-muted)" }}>AI tokens</span>
                <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  {formatTokens(usage.total_tokens)}
                </span>
              </div>
              {usage.breakdown.map((b) => (
                <div
                  key={b.event_type}
                  className="flex items-center justify-between px-2 text-[11px]"
                >
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {labelFor(b.event_type)}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>{b.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <a href="/settings" className="block px-3 py-2.5 text-xs hover:bg-[var(--color-bg)]">AI settings</a>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors duration-150 hover:bg-[var(--color-bg)]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}
