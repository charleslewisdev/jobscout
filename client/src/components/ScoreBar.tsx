interface ScoreBarProps {
  label: string;
  score: number | null;
  max?: number;
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-450";
  if (score >= 30) return "bg-orange-500";
  return "bg-red-400";
}

export function ScoreBar({ label, score, max = 100 }: ScoreBarProps) {
  if (score === null || score === undefined) return null;

  const pct = Math.min(100, (score / max) * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-20 shrink-0 text-right font-mono">
        {label}
      </span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-300 w-8 text-right">
        {score}
      </span>
    </div>
  );
}
