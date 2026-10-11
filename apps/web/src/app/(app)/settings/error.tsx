"use client";

export default function SettingsError({ reset }: { reset: () => void }) {
  return <main className="flex-1 p-6 md:p-10"><div className="max-w-2xl mx-auto"><h1 className="text-2xl font-semibold">AI settings</h1><p role="alert" className="mt-6">Could not load settings.</p><button onClick={reset} className="mt-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">Try again</button></div></main>;
}
