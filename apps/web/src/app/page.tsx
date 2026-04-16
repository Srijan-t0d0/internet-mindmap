import type { ViewMode } from "@internet-mindmap/shared";
import { getSession, getItems, searchItemsServer, getTags } from "../lib/data";
import LoginPage from "../components/LoginPage";
import ItemsShell from "../components/ItemsShell";

type SearchParams = Promise<{
  view?: string;
  source?: string;
  tag?: string;
  q?: string;
}>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();

  if (!session) {
    return <LoginPage />;
  }

  const params = await searchParams;
  // "chat" is now its own page at /chat — default explore to cards
  const viewMode = (params.view as ViewMode) ?? "cards";
  const selectedSource = params.source ?? null;
  const selectedTag = params.tag ?? null;
  const searchQuery = params.q ?? "";

  const [itemsData, tagsData] = await Promise.all([
    searchQuery
      ? searchItemsServer({
          q: searchQuery,
          source_type: selectedSource,
          tag: selectedTag,
        })
      : getItems({ limit: 500 }),
    getTags(),
  ]);

  const items = itemsData.items;
  const total = "total" in itemsData ? itemsData.total : (itemsData as { count: number }).count;

  return (
    <ItemsShell
      initialItems={items}
      initialTotal={total}
      initialTags={tagsData.tags}
    />
  );
}
