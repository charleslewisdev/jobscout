const statusStyles: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  bookmarked: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  dismissed: "bg-red-500/10 text-red-400 ring-red-500/20",
  // Legacy statuses (still in DB for old matches)
  reviewed: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
  shared: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? statusStyles.new;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium font-mono rounded ring-1 ring-inset ${style}`}
    >
      {status}
    </span>
  );
}
