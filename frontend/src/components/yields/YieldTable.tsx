import { useYields } from "../../hooks/useYields.js";
import { YieldRow } from "./YieldRow.js";
import { ApySkeleton } from "./ApySkeleton.js";

export function YieldTable() {
  const { data, isLoading, isError } = useYields();

  if (isError) {
    return (
      <div className="rounded-xl border border-risk-high/20 bg-risk-high/5 p-6 text-center">
        <p className="text-risk-high text-sm">
          Unable to load yield data. The indexer may be offline.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <ApySkeleton key={i} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-text-secondary text-center py-10">
        No yield data available right now.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((y) => (
        <YieldRow key={y.protocol} data={y} />
      ))}
    </div>
  );
}
