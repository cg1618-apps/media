// Frontend: the Add tab's external search - the box that links a new entry to
// its record on MyAnimeList, TMDB, Open Library, Comic Vine or IGDB.
//
// Every source answers the same ExternalSearchResult rows (external_id, link,
// title, title_alt, year, detail, cover_url), so one component draws every
// picker. It never touches form state: `onPick` receives the picked row, and
// which columns it writes is the page's decision (lib/externalPick.js).
//
// The markup matches EntryAutofillSearch, the "copy an existing entry" box
// that sits above it on most tabs, so the two read as one control.
import { useEffect, useRef, useState } from "react";

import { fetchJson } from "../../api/client";
import { SuggestItem, SuggestList, SuggestNote } from "./SuggestList";

export const EXTERNAL_SEARCH_DEBOUNCE_MS = 350;
export const EXTERNAL_SEARCH_MIN_CHARS = 2;
const RESULT_LIMIT = 10;
const EMPTY_ANSWER = { key: null, results: [], error: null };

/**
 * What the dropdown says when a search fails. A failing source answers 502
 * with a human `detail`, which fetchJson raises as the error's message; a
 * network failure (TypeError) or an unreadable body (SyntaxError) carries
 * nothing worth showing, so it gets the generic line.
 */
function failureMessage(error, source) {
  if (error instanceof TypeError || error instanceof SyntaxError || !error?.message) {
    return `Could not reach the ${source} search. Check the connection and try again.`;
  }
  return error.message;
}

/**
 * Props:
 * - `source`: the source's name, for the placeholder, aria label and notes.
 * - `searchUrl(q, limit)`: the endpoint, from api/endpoints.js.
 * - `onPick(result)`: called with the picked ExternalSearchResult row.
 * - `submitOnEnter`: search only when Enter is pressed, never as-you-type -
 *   for a source with a tight request budget (Comic Vine).
 * - `placeholder`, `hint`: optional wording; `hint` shows under the box.
 */
export default function ExternalSearchBox({
  source,
  searchUrl,
  onPick,
  submitOnEnter = false,
  placeholder,
  hint,
}) {
  const [query, setQuery] = useState("");
  // Enter mode only: the term last submitted, and a counter so pressing
  // Enter again on the same term searches again.
  const [submitted, setSubmitted] = useState({ term: "", n: 0 });
  // The last answer, keyed by the request it answers. Whether a search is in
  // flight is derived from the key, so the effect sets state only when an
  // answer lands.
  const [answer, setAnswer] = useState(EMPTY_ANSWER);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const typed = query.trim();
  const term = submitOnEnter ? submitted.term : typed;
  const key = submitOnEnter ? `${submitted.n}:${term}` : term;
  const active = term.length >= EXTERNAL_SEARCH_MIN_CHARS;
  const current = active && answer.key === key;
  const loading = active && !current;
  // While a new term is in flight the previous rows stay up, so the list
  // does not flicker shut between keystrokes.
  const results = active ? answer.results : [];
  const error = current ? answer.error : null;

  // As-you-type, a request goes out only once the typing settles; on Enter it
  // goes out at once. Either way the cleanup marks the in-flight answer
  // cancelled, so a slow reply to an earlier term never overwrites a newer one.
  useEffect(() => {
    if (term.length < EXTERNAL_SEARCH_MIN_CHARS) return undefined;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        let next;
        try {
          const data = await fetchJson(searchUrl(term, RESULT_LIMIT));
          next = { key, results: Array.isArray(data) ? data : [], error: null };
        } catch (e) {
          // A failure is never "no results": the message says why.
          next = { key, results: [], error: failureMessage(e, source) };
        }
        if (!cancelled) setAnswer(next);
      },
      submitOnEnter ? 0 : EXTERNAL_SEARCH_DEBOUNCE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, key, searchUrl, submitOnEnter, source]);

  // Clicking anywhere else closes the dropdown, as the auto-fill box does.
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function reset() {
    setQuery("");
    setAnswer(EMPTY_ANSWER);
    setSubmitted((s) => ({ term: "", n: s.n + 1 }));
    setOpen(false);
  }

  function pick(result) {
    onPick(result);
    reset();
  }

  // Enter never submits the Add form from here. In Enter mode it searches.
  function onKeyDown(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!submitOnEnter || typed.length < EXTERNAL_SEARCH_MIN_CHARS) return;
    setSubmitted((s) => ({ term: typed, n: s.n + 1 }));
    setOpen(true);
  }

  const awaitingEnter =
    submitOnEnter &&
    typed.length >= EXTERNAL_SEARCH_MIN_CHARS &&
    typed !== submitted.term;
  const noMatches = current && !error && results.length === 0;
  const showList =
    open && (results.length > 0 || error || noMatches || awaitingEnter);

  return (
    <div ref={boxRef} className="relative mb-4">
      <div className="flex items-center gap-2 bg-brand-soft border border-brand/20 rounded-xl px-4 py-2.5">
        <i className="fas fa-magic text-brand text-sm"></i>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // Enter mode: what was found belongs to the term submitted, not
            // to what is being typed now.
            if (submitOnEnter && submitted.term) {
              setSubmitted((s) => ({ term: "", n: s.n + 1 }));
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            placeholder ??
            (submitOnEnter
              ? `Search ${source} — type a title and press Enter to link it...`
              : `Search ${source} — type a title to link it...`)
          }
          aria-label={`Search ${source}`}
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-text-muted placeholder-text-faint"
          autoComplete="off"
        />
        {loading && <i className="fas fa-spinner fa-spin text-brand text-xs"></i>}
        {query && (
          <button
            type="button"
            onClick={reset}
            className="text-text-faint hover:text-text-muted"
            aria-label={`Clear ${source} search`}
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-text-faint mt-1 px-1">{hint}</p>}
      {showList && (
        <SuggestList anchorRef={boxRef} label={`${source} results`}>
          {awaitingEnter && (
            <SuggestNote>
              <i className="fas fa-level-down-alt fa-rotate-90"></i>
              Press Enter to search {source}
            </SuggestNote>
          )}
          {!awaitingEnter && error && (
            <SuggestNote>
              <i className="fas fa-exclamation-triangle text-danger"></i>
              <span className="text-danger">{error}</span>
            </SuggestNote>
          )}
          {!awaitingEnter && noMatches && (
            <SuggestNote>No matches on {source}</SuggestNote>
          )}
          {!awaitingEnter &&
            results.map((r) => (
              <SuggestItem key={r.external_id} truncate={false} onPick={() => pick(r)}>
                <div className="flex items-center gap-3">
                  {r.cover_url ? (
                    <img
                      loading="lazy"
                      src={r.cover_url}
                      alt={r.title}
                      className="w-8 h-11 object-cover rounded shrink-0"
                      // A search result's own cover, not a stored owner image.
                      data-focus="none"
                    />
                  ) : (
                    <span className="w-8 h-11 rounded bg-surface-2 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-bold text-text">{r.title}</span>
                      {r.title_alt && (
                        <span className="text-xs text-text-muted">{r.title_alt}</span>
                      )}
                      {r.year && (
                        <span className="text-[11px] font-semibold text-text-faint shrink-0">
                          {r.year}
                        </span>
                      )}
                    </div>
                    {r.detail && (
                      <div className="text-xs text-text-faint">{r.detail}</div>
                    )}
                  </div>
                </div>
              </SuggestItem>
            ))}
        </SuggestList>
      )}
    </div>
  );
}
