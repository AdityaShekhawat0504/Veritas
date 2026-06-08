// Circular integrity-score dial. Color follows the integrity band.
import { integrityBand } from "@/lib/score";

const BAND_COLOR = {
  high: "var(--color-holding)",
  medium: "var(--color-weakening)",
  low: "var(--color-contradicted)",
} as const;

export function ScoreDial({
  score,
  size = 132,
}: {
  score: number;
  size?: number;
}) {
  const stroke = size < 80 ? 6 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = c * (1 - clamped / 100);
  const color = BAND_COLOR[integrityBand(clamped)];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tabular-nums leading-none"
          style={{ color, fontSize: size * 0.32 }}
        >
          {clamped}
        </span>
        {size >= 80 && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            Integrity
          </span>
        )}
      </div>
    </div>
  );
}
