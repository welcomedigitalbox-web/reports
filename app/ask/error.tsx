"use client";
export default function AskError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-2xl mx-auto pt-10 text-sm">
      <h2 className="font-semibold text-red-600 mb-2">Ask page error</h2>
      <pre className="whitespace-pre-wrap bg-red-50 p-3 rounded">{error.message}</pre>
      <pre className="whitespace-pre-wrap text-xs text-slate-500 mt-2">{error.stack?.slice(0, 1500)}</pre>
      <button onClick={reset} className="mt-3 px-3 py-1.5 bg-slate-800 text-white rounded">Retry</button>
    </div>
  );
}
