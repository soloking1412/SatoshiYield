export function MarkSC({
  size = 30,
  pulse = false,
}: {
  size?: number;
  pulse?: boolean;
}) {
  const s = size,
    cx = s / 2,
    sw = Math.max(1.6, s * 0.092);
  const bot = s * 0.9,
    top = s * 0.1,
    sp = s * 0.27;

  const mkP = (dx: number, lift: number) => {
    const px = cx + dx,
      py = s * 0.5 - lift;
    return `M ${cx} ${bot} C ${cx} ${s * 0.6} ${px} ${s * 0.52} ${px} ${py} C ${px} ${py - s * 0.12} ${cx} ${top + s * 0.07} ${cx} ${top}`;
  };

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      style={pulse ? { animation: "breathe 2.8s ease-in-out infinite" } : undefined}
    >
      <path
        d={mkP(-sp, s * 0.13)}
        stroke="var(--accent2)"
        strokeWidth={sw}
        strokeLinecap="round"
        opacity=".5"
      />
      <path
        d={mkP(0, s * 0.3)}
        stroke="var(--accent)"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d={mkP(+sp, s * 0.09)}
        stroke="var(--accent)"
        strokeWidth={sw}
        strokeLinecap="round"
        opacity=".38"
      />
      <circle cx={cx} cy={top} r={sw * 0.82} fill="var(--accent)" />
      <circle cx={cx} cy={bot} r={sw * 0.62} fill="var(--accent2)" />
    </svg>
  );
}
