"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <p role="alert">Something went wrong.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
