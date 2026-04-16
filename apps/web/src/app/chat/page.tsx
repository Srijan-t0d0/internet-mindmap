import { getSession, getTags, getItems } from "../../lib/data";
import LoginPage from "../../components/LoginPage";
import ChatShell from "./ChatShell";

export default async function ChatPage() {
  const session = await getSession();

  if (!session) {
    return <LoginPage />;
  }

  const [tagsData, itemsData] = await Promise.all([
    getTags(),
    getItems({ limit: 1 }),
  ]);

  return (
    <ChatShell
      initialTags={tagsData.tags}
      itemCount={itemsData.total}
    />
  );
}
