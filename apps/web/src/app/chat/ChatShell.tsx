"use client";

import type { Tag } from "@internet-mindmap/shared";
import Sidebar from "../../components/Sidebar";
import ChatView from "../../components/ChatView";

interface ChatShellProps {
  initialTags: Tag[];
  itemCount: number;
}

export default function ChatShell({ initialTags, itemCount }: ChatShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar tags={initialTags} itemCount={itemCount} />
      <ChatView />
    </div>
  );
}
