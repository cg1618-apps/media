// Frontend: the editor and the read view for a note's links - titled pairs,
// on every section that takes links (text_links, name_links, music_track,
// op_ed_changes and every structured links field). The rules are in
// linkPairValues.js.
import SuggestInput from "../../../components/forms/SuggestInput";
import { LinkPill, inputCls } from "./ui";
import { pairLabel, pairsFromLinks } from "./linkPairValues";

// A repeatable row of optional title + URL. `textOptions` turns the title
// into a SuggestInput over those values (a song link's "Song Source");
// without it the title is plain text. Starts with one blank row so there is
// something to type into.
//
// The title sits above the URL at full width, at every screen size: a title
// is usually the longer of the two, and beside the URL it had no room.
export function LinkPairsEditor({ pairs, onChange, textOptions }) {
  const list = pairs?.length ? pairs : [{ text: "", url: "" }];
  const setPair = (i, patch) =>
    onChange(list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      {list.map((pair, i) => (
        <div key={i} className="flex flex-col gap-1">
          {textOptions ? (
            <SuggestInput
              value={pair.text}
              onChange={(v) => setPair(i, { text: v })}
              options={textOptions}
              placeholder="Link Title (optional)"
              aria-label="Link text"
              className={inputCls}
            />
          ) : (
            <input
              value={pair.text}
              onChange={(e) => setPair(i, { text: e.target.value })}
              placeholder="Link Title (optional)"
              aria-label="Link text"
              className={inputCls}
            />
          )}
          <div className="flex gap-1 flex-1 min-w-0">
            <input
              value={pair.url}
              onChange={(e) => setPair(i, { url: e.target.value })}
              placeholder="https://..."
              aria-label="Link URL"
              className={inputCls}
            />
            {list.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(list.filter((_, idx) => idx !== i))}
                aria-label="Remove link"
                title="Remove link"
                className="text-text-faint hover:text-danger px-1"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, { text: "", url: "" }])}
        className="font-mono text-[11px] text-text-muted hover:text-brand transition"
      >
        + Add link
      </button>
    </div>
  );
}

// The stored links as pills, each labelled with its title or, failing that,
// its host. `bare` leaves out the wrapping row, for a caller that lays the
// pills out among others.
export function LinkPairPills({ links, bare = false }) {
  const pairs = pairsFromLinks(links).filter((p) => p.url);
  if (!pairs.length) return null;
  const pills = pairs.map((pair, i) => (
    <LinkPill key={i} url={pair.url} label={pairLabel(pair)} titled={!!pair.text} />
  ));
  return bare ? pills : <div className="flex flex-wrap gap-1">{pills}</div>;
}
