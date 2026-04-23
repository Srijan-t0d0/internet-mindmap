"use client";

import { useEffect, useState, useCallback } from "react";

type ThreadRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

const THREAD_ID_KEY = "im.currentThreadId";

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = process.env.NEXT_PUBLIC_API_TOKEN;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export default function ThreadsList() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/threads", {
        credentials: "include",
        headers: getHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: ThreadRow[] };
      setThreads(data.threads ?? []);
    } catch {
      // ignore — list just stays empty
    }
  }, []);

  useEffect(() => {
    refetch();
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(THREAD_ID_KEY)
        : null;
    setActiveId(stored);

    const onChange = () => {
      refetch();
      const id =
        typeof window !== "undefined"
          ? window.localStorage.getItem(THREAD_ID_KEY)
          : null;
      setActiveId(id);
    };
    window.addEventListener("chat:threads-changed", onChange);
    window.addEventListener("storage", (e) => {
      if (e.key === THREAD_ID_KEY) setActiveId(e.newValue);
    });
    return () => {
      window.removeEventListener("chat:threads-changed", onChange);
    };
  }, [refetch]);

  function handleClick(id: string) {
    setActiveId(id);
    window.localStorage.setItem(THREAD_ID_KEY, id);
    window.dispatchEvent(
      new CustomEvent("chat:switch-thread", { detail: { id } })
    );
  }

  if (threads.length === 0) return null;

  return (
    <div>
      <h2
        className="text-[11px] font-medium uppercase tracking-widest mb-2 px-3"
        style={{ color: "var(--color-text-muted)" }}
      >
        Threads
      </h2>
      <div className="space-y-0.5">
        {threads.slice(0, 50).map((t) => {
          const active = activeId === t.id;
          const title = t.title?.trim() || "Untitled";
          return (
            <button
              key={t.id}
              onClick={() => handleClick(t.id)}
              className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-all duration-150 flex items-center gap-2"
              style={{
                backgroundColor: active ? "var(--color-bg-card)" : "transparent",
                color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: active ? 500 : 400,
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
              title={title}
            >
              <span className="truncate flex-1">{title}</span>
              <span
                className="text-[10px] tabular-nums flex-shrink-0"
                style={{ color: "var(--color-text-muted)", opacity: 0.7 }}
              >
                {fmtRelative(t.updated_at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
