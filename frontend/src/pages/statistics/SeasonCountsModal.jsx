// Frontend: statistics page file for SeasonCountsModal.
//
// Every season's anime count, opened by "Show all" under Anime by season. The
// app's own modal chrome (the shape of ConfirmModal and RemarkModal): Escape,
// the close button and a press that starts and ends on the backdrop all
// close it. The list is long and each row is narrow, so it is laid out as a
// grid of season/count pairs - two columns on a phone, up to six on a wide
// screen - reading down each column, newest first.
import { useEffect, useRef } from "react";

export default function SeasonCountsModal({ seasons, onClose }) {
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-counts-title"
        className="bg-surface border border-border shadow-xl w-full max-w-6xl max-h-[85vh] flex flex-col m-4"
      >
        <div className="px-6 py-3 border-b border-border flex justify-between items-center">
          <h3
            id="season-counts-title"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            Anime by season · {seasons.length} seasons
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-faint hover:text-text transition px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          <dl
            aria-label="Every season"
            className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-x-8"
          >
            {seasons.map((row) => (
              <div
                key={row.season}
                className="break-inside-avoid flex justify-between gap-4 py-1.5 border-b border-border text-sm"
              >
                <dt className="text-text font-mono">{row.season}</dt>
                <dd className="text-text font-mono tabular-nums">{row.entry_count}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
