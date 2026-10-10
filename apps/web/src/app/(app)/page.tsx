import { Suspense } from "react";
import { getSession, getItems, searchItemsServer } from "../../lib/data";
import ItemsShell from "../../components/ItemsShell";
import ItemsShellSkeleton from "../../components/ItemsShellSkeleton";
import { getItemQueryParams, ITEMS_PAGE_SIZE, type ItemQueryParams } from "../../lib/item-query";

type SearchParams = Promise<{
  view?: string;
  source?: string;
  tag?: string;
  q?: string;
  page?: string;
}>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = getItemQueryParams(await searchParams);

  return (
    <Suspense fallback={<ItemsShellSkeleton />}>
      <ExploreLoader params={params} />
    </Suspense>
  );
}

async function ExploreLoader({ params }: { params: ItemQueryParams }) {
  // Layout short-circuits to LoginPage when unauthenticated, but Next renders
  // the page in parallel with the layout — guard here so the fetch doesn't
  // throw 401 and cascade into a server-render error.
  const session = await getSession();
  if (!session) return null;

  const itemsData = params.q
    ? await searchItemsServer({
        q: params.q,
        source_type: params.source,
        tag: params.tag,
      })
    : await getItems({
        source_type: params.source,
        tag: params.tag,
        is_read: params.isRead ? "false" : undefined,
        limit: ITEMS_PAGE_SIZE,
        offset: (params.page - 1) * ITEMS_PAGE_SIZE,
      });

  const items = itemsData.items;
  const total =
    "total" in itemsData
      ? itemsData.total
      : (itemsData as { count: number }).count;

  return <ItemsShell initial={{ data: { items, total }, params, updatedAt: Date.now() }} />;
}
