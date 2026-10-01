import type { CSSProperties } from "react";

type IconName = "arrow" | "external" | "shield" | "search" | "wallet" | "chart" | "grid" | "sun" | "moon" | "close" | "chevron" | "refresh" | "info";
const paths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  external: <><path d="M14 4h6v6m0-6L10 14" /><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
  shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" /><path d="M12 8v5m0 3h.01" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
  wallet: <><path d="M20 8V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6" /><path d="M20 12h-6v4h6m-3-2h.01" /></>,
  chart: <><path d="M4 3v17h17M8 15v-4m5 4V7m5 8V5" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  refresh: <><path d="M20 8V3l-3 3a8 8 0 1 0 3 9M20 3h-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
};
export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
