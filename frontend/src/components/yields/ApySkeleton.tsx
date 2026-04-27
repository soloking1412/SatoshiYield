export function ApySkeleton() {
  return (
    <div
      data-testid="apy-skeleton"
      className="animate-pulse bg-surface-card rounded-xl p-4 flex items-center gap-4"
    >
      <div className="w-8 h-8 rounded-full bg-surface-hover" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-surface-hover rounded w-1/4" />
        <div className="h-3 bg-surface-hover rounded w-1/2" />
      </div>
      <div className="h-6 bg-surface-hover rounded w-20" />
      <div className="h-8 bg-surface-hover rounded w-24" />
    </div>
  );
}
