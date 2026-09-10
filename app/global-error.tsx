"use client";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html><body style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h2 style={{ color: "#dc2626" }}>App error</h2>
      <pre style={{ whiteSpace: "pre-wrap", background: "#fef2f2", padding: 12 }}>{error.message}</pre>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#64748b" }}>{error.stack?.slice(0, 1500)}</pre>
      <button onClick={reset}>Retry</button>
    </body></html>
  );
}
