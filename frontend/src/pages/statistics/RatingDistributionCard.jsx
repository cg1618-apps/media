// Frontend: statistics page file for RatingDistributionCard.
//
// One horizontal bar per bucket, scaled to the largest, with its count and its
// share of `total`. Shared by the personal rating cards and the catalogue's
// score distributions. A `dim` row (Unrated) is drawn muted and given no share.
import { Eyebrow, Slip } from "../../components/ui/primitives";

export default function RatingDistributionCard({ title, subtitle, rows, total }) {
  const maxCount = Math.max(...rows.filter((r) => !r.dim).map((r) => r.count), 1);
  return (
    <Slip title={title} actions={<Eyebrow>{subtitle}</Eyebrow>}>
      <div className="space-y-2.5">
        {rows.map(({ label, color, count, dim }) => {
          const pct = !dim && total > 0 ? Math.round((count / total) * 100) : null;
          const barWidth = (count / maxCount) * 100;
          return (
            <div key={label} className="flex items-center gap-3">
              <span
                className={`w-16 text-right font-mono text-[11px] shrink-0 ${
                  dim ? "text-text-faint" : "text-text-muted"
                }`}
              >
                {label}
              </span>
              <div className="flex-1 bg-surface-2 h-3 overflow-hidden">
                <div
                  className={`h-3 transition-all duration-700 ${color}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs text-text tabular-nums shrink-0">
                {count}
              </span>
              <span className="w-10 text-right font-mono text-[11px] text-text-faint tabular-nums shrink-0">
                {pct !== null ? `${pct}%` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </Slip>
  );
}
