import { Suspense } from "react";
import SettingsView from "../../../components/SettingsView";
import { getSession, getSettings } from "../../../lib/data";

export default function SettingsPage() {
  return <Suspense fallback={<main className="flex-1 p-6 md:p-10" aria-busy="true" aria-label="Loading AI settings"><div className="max-w-2xl mx-auto space-y-8"><h1 className="text-2xl font-semibold">AI settings</h1>{[0, 1, 2].map((key) => <div key={key} className="h-28 rounded-lg bg-[var(--color-bg-secondary)]" />)}</div></main>}><SettingsLoader /></Suspense>;
}

async function SettingsLoader() {
  if (!await getSession()) return null;
  const settings = await getSettings();
  return <SettingsView initialSettings={settings} updatedAt={Date.now()} />;
}
