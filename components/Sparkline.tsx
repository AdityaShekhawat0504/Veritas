// Tiny inline SVG sparkline of integrity-score history.
export function Sparkline({
  points,
  width = 180,
  height = 44,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return <div className="text-xs text-ink-faint">No history yet</div>;
  }

  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  // Fix the domain to 0–100 so the line reflects absolute integrity, not relative wiggle.
  const min = 0;
  const max = 100;

  const coords = points.map((v, i) => {
    const x =
      points.length === 1 ? pad : pad + (i / (points.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / (max - min)) * innerH;
    return [x, y] as const;
  });

  const path = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const color =
    last >= 80
      ? "var(--color-holding)"
      : last >= 60
        ? "var(--color-weakening)"
        : "var(--color-contradicted)";
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.75} fill={color} />
    </svg>
  );
}
