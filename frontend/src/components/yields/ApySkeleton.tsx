export function ApySkeleton() {
  return (
    <div
      data-testid="apy-skeleton"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 22px",
        borderRadius: 13,
        background: "var(--bg2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--bg3)",
          flexShrink: 0,
          animation: "breathe 1.5s ease-in-out infinite",
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            height: 14,
            width: "30%",
            borderRadius: 6,
            background: "var(--bg3)",
            animation: "breathe 1.5s ease-in-out infinite",
          }}
        />
        <div
          style={{
            height: 10,
            width: "20%",
            borderRadius: 6,
            background: "var(--bg3)",
            animation: "breathe 1.5s 0.2s ease-in-out infinite",
          }}
        />
      </div>
      <div
        style={{
          width: 60,
          height: 28,
          borderRadius: 6,
          background: "var(--bg3)",
          animation: "breathe 1.5s 0.1s ease-in-out infinite",
        }}
      />
      <div
        style={{
          width: 80,
          height: 36,
          borderRadius: 9,
          background: "var(--bg3)",
          animation: "breathe 1.5s 0.15s ease-in-out infinite",
        }}
      />
    </div>
  );
}
