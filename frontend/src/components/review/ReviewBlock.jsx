// Frontend: the shell every review-queue block shares.
//
// Each block on /review-queue is one check that loads on demand: a title, a
// one-line count once it has loaded, a load/refresh button, then either a
// prompt to load, an empty state, or the block's own body. The tab bar below
// is the one every block with tabs draws, so the four blocks look like one
// page rather than four.

export function ReviewTabBar({ tabs, active, onSelect }) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap border-b border-border bg-surface-2 px-4 pt-3 gap-1"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onSelect(t.key)}
          className={`px-4 py-2 text-xs font-black rounded-t-lg transition border-b-2 -mb-px ${
            active === t.key
              ? "border-brand text-brand bg-surface"
              : "border-transparent text-text-faint hover:text-text-muted hover:bg-surface-2"
          }`}
        >
          {t.label}
          {t.count > 0 && (
            <span className="ml-1.5 bg-brand-soft text-brand text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyTab({ children }) {
  return (
    <div className="text-center py-8 text-text-faint">
      <p className="font-bold text-sm">{children}</p>
    </div>
  );
}

/**
 * `loaded` is false until the first load answers; `total` is what the
 * subtitle counts. `summary(total)` words that count; `emptyText` is the
 * whole-block empty state.
 */
export default function ReviewBlock({
  title,
  loadLabel,
  loaded,
  loading,
  error,
  total,
  summary,
  emptyText,
  onRefresh,
  children,
}) {
  return (
    <section className="space-y-4" aria-label={title}>
      <div className="flex items-center justify-between border-b-2 border-border pb-2">
        <div>
          <h2 className="text-2xl font-black text-text tracking-tight">{title}</h2>
          {loaded && (
            <p className="text-xs text-text-faint mt-0.5">{summary(total)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-on-brand px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm"
        >
          {loading && <i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i>}
          {loading ? "Loading…" : loaded ? "Refresh" : loadLabel}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {!loaded ? (
        <div className="bg-surface rounded-2xl border border-border shadow-sm flex items-center justify-center py-16 text-text-faint">
          <p className="font-bold">Press &ldquo;{loadLabel}&rdquo; to load.</p>
        </div>
      ) : total === 0 ? (
        <div className="bg-surface rounded-2xl border border-border shadow-sm flex items-center justify-center py-16 text-text-faint">
          <p className="font-bold">{emptyText}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          {children}
        </div>
      )}
    </section>
  );
}
