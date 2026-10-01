export function MarkSC({ size = 30 }: { size?: number; pulse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="m16 3 12 7v12l-12 7L4 22V10L16 3Z" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M11 12h8.5a3 3 0 0 1 0 6H12m1-6v12m5-15v3M11 22h9a3 3 0 0 0 0-6" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
