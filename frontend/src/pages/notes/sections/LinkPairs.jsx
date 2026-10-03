// Frontend: the editor and the read view for text-and-URL link pairs, shared
// by MusicTrackSection (OP, ED, insert songs, OST) and StructuredSection's
// `link_pairs` field (彩蛋 Easter Eggs). The rules are in linkPairValues.js.
import SuggestInput from "../../../components/forms/SuggestInput";
import { LinkPill, inputCls } from "./ui";
import { pairLabel, pairsFromLinks } from "./linkPairValues";

const textCls = inputCls + " sm:w-40 sm:shrink-0";

// A repeatable row of label + URL. `textOptions` turns the label into a
// SuggestInput over those values (a song link's "Song Source"); without it
// the label is plain text. Starts with one blank row so there is something to
// type into, like LinksEditor.
export function LinkPairsEditor({ pairs, onChange, textOptions }) {
  const list = pairs?.length ? pairs : [{ text: "", url: "" }];
  const setPair = (i, patch) =>
    onChange(list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-1">
      {list.map((pair, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-1">
          {textOptions ? (
            <SuggestInput
              value={pair.text}
              onChange={(v) => setPair(i, { text: v })}
              options={textOptions}
              placeholder="Link text"
              aria-label="Link text"
              className={textCls}
            />
          ) : (
            <input
              value={pair.text}
              onChange={(e) => setPair(i, { text: e.target.value })}
              placeholder="Link text"
              aria-label="Link text"
              className={textCls}
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
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-brand transition"
      >
        + Add link
      </button>
    </div>
  );
}

// The stored links as pills, each labelled with its text or, failing that,
// its host.
export function LinkPairPills({ links }) {
  const pairs = pairsFromLinks(links).filter((p) => p.url);
  if (!pairs.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {pairs.map((pair, i) => (
        <LinkPill key={i} url={pair.url} label={pairLabel(pair)} />
      ))}
    </div>
  );
}
