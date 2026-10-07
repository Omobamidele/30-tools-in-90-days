"use client";

// Replaces the root layout, so it can't rely on globals.css: styles are inline.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f5f2", color: "#1b2220", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
        <title>Something went wrong</title>
        <div style={{ maxWidth: 420, padding: "32px 24px", background: "#fff", border: "1px solid #dadfdb", borderRadius: 6 }}>
          <h1 style={{ fontSize: 15, margin: 0 }}>The application couldn&apos;t start</h1>
          <p style={{ color: "#5b6561", margin: "4px 0 0" }}>Try again. If it keeps happening, send the reference below to your administrator.</p>
          {error.digest ? <p style={{ color: "#5b6561", fontSize: 12 }}>Reference {error.digest}</p> : null}
          <button onClick={() => retry()} style={{ marginTop: 16, height: 32, padding: "0 12px", border: 0, borderRadius: 4, background: "#0d6b6b", color: "#fff", fontWeight: 500, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
