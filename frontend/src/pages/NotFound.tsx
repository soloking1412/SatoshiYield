import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-24 flex flex-col items-center gap-6 text-center">
      <h1 className="text-6xl font-bold text-text-muted">404</h1>
      <p className="text-text-secondary">Page not found.</p>
      <Link
        to="/"
        className="px-5 py-2.5 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim transition-colors"
      >
        Go home
      </Link>
    </main>
  );
}
