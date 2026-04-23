import { Suspense } from "react";
import { getItems, searchItemsServer } from "../../lib/data";
import ItemsShell from "../../components/ItemsShell";
import ItemsShellSkeleton from "../../components/ItemsShellSkeleton";

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
  const params = await searchParams;
  const searchQuery = params.q ?? "";
  const selectedSource = params.source ?? null;
  const selectedTag = params.tag ?? null;

  return (
    <Suspense fallback={<ItemsShellSkeleton />}>
      <ExploreLoader
        searchQuery={searchQuery}
        selectedSource={selectedSource}
        selectedTag={selectedTag}
      />
    </Suspense>
  );
}

async function ExploreLoader({
  searchQuery,
  selectedSource,
  selectedTag,
}: {
  searchQuery: string;
  selectedSource: string | null;
  selectedTag: string | null;
}) {
  const itemsData = searchQuery
    ? await searchItemsServer({
        q: searchQuery,
        source_type: selectedSource,
        tag: selectedTag,
      })
    : await getItems({ limit: 500 });

  const items = itemsData.items;
  const total =
    "total" in itemsData
      ? itemsData.total
      : (itemsData as { count: number }).count;

  return <ItemsShell initialItems={items} initialTotal={total} />;
}
