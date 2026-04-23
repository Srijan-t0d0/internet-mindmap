import { Suspense } from "react";
import { getSession, getTags, getItems } from "../../lib/data";
import LoginPage from "../../components/LoginPage";
import Sidebar from "../../components/Sidebar";
import SidebarSkeleton from "../../components/SidebarSkeleton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) return <LoginPage />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarLoader />
      </Suspense>
      {children}
    </div>
  );
}

async function SidebarLoader() {
  const [tagsData, countData] = await Promise.all([
    getTags(),
    getItems({ limit: 1 }),
  ]);
  return <Sidebar tags={tagsData.tags} itemCount={countData.total} />;
}
