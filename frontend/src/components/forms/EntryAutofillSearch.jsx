// Frontend: "Auto-fill from existing entry" - the search box at the top of an
// Add tab that copies fields from an entry already in the catalogue.
//
// The box, its query and whether its dropdown is open live here rather than
// in Add.jsx, so a tab needs only the entries to search and what to do with
// the one picked. Add.jsx still decides WHICH fields a pick copies
// (buildAutofillPatch over the /defaults configuration). The markup matches
// the older tabs, which inline the same box, so the two read as one control.
import { useEffect, useRef, useState } from "react";

import { cleanString, getDisplayName } from "../../utils/media";

const MAX_RESULTS = 10;

export default function EntryAutofillSearch({
  items,
  names,
  title,
  franchises = [],
  badge,
  onPick,
  loading = false,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const needle = cleanString(query);
  const results = query
    ? (items || [])
        .filter((item) =>
          names(item).some((n) => n && cleanString(n).includes(needle)),
        )
        .slice(0, MAX_RESULTS)
    : [];

  function pick(item) {
    onPick(item);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative mb-4">
      <div className="flex items-center gap-2 bg-brand-soft border border-brand/20 rounded-xl px-4 py-2.5">
        <i className="fas fa-magic text-brand text-sm"></i>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={loading}
          placeholder="Auto-fill from existing entry — type a name to search..."
          aria-label="Auto-fill from existing entry"
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-text-muted placeholder-text-faint"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="text-text-faint hover:text-text-muted"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        )}
      </div>
      {open && loading && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg px-4 py-2.5 text-sm text-text-faint flex items-center gap-2">
          <i className="fas fa-spinner fa-spin"></i>
          Loading entries to search from…
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {results.map((item) => {
            const tag = badge?.(item);
            const franchise = franchises.find(
              (f) => f.system_id === item.franchise_id,
            );
            return (
              <button
                key={item.system_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2">
                  {tag && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-surface-2 text-text-faint shrink-0">
                      {tag}
                    </span>
                  )}
                  <span className="text-sm font-bold text-text">{title(item)}</span>
                </div>
                <div className="text-xs text-text-faint">
                  {franchise ? getDisplayName(franchise, "franchise") : "Standalone"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
