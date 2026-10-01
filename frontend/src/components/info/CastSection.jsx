// Frontend: the read-only cast list every ACG detail page shows.
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { castRoleRank } from "../../config/fieldOptions";
import { entityPath } from "../../lib/entityPath";
import { focusStyle } from "../../lib/covers";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { Button, Chip, Slip } from "../ui/primitives";

const castLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

// Castings in CHARACTER_ROLES order (Main, Core, Supporting, Other), then
// whatever order the server already gave; a casting with no role sorts last
// rather than crowding the top (castRoleRank).
function sortCast(cast) {
  return [...cast].sort((a, b) => {
    const ra = castRoleRank(a.role);
    const rb = castRoleRank(b.role);
    if (ra !== rb) return ra - rb;
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

// The tiers the slip shows inline. Collapsed is every Main character;
// expanded adds Core. Supporting, Other and role-less rows are only ever in
// the full-cast popup, so a long cast never pushes the page down.
const COLLAPSED_ROLES = ["Main"];
const EXPANDED_ROLES = ["Main", "Core"];

const toggleCls =
  "text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function CastRow({ row }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 shrink-0 bg-surface-2 overflow-hidden rounded">
        <img
          loading="lazy"
          src={getCoverUrl(row.photo_file)}
          alt=""
          className="w-full h-full object-cover"
          style={focusStyle(row.photo_focus)}
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        {row.role && <Chip>{row.role}</Chip>}
        {/* The casting row carries the target's own public_id and
            display name, so this is the real entity, not a stub. */}
        <Link
          to={entityPath("character", {
            public_id: row.character_public_id,
            display_name: row.character_name,
          })}
          className={castLinkCls}
        >
          {row.character_name || "Unknown"}
        </Link>
        {row.voices?.length > 0 && (
          <span className="text-text-faint text-xs">voiced by</span>
        )}
        {(row.voices || []).map((voice, i) => (
          <Fragment key={voice.person_id}>
            {i > 0 && <span className="text-text-faint text-xs">·</span>}
            <Link
              to={entityPath("person", {
                public_id: voice.person_public_id,
                display_name: voice.person_name,
              })}
              className={castLinkCls}
            >
              {voice.person_name || "Unknown"}
            </Link>
            {voice.remark && (
              <span className="text-text-faint text-xs">({voice.remark})</span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// The whole cast, every role, in a dialog. Same backdrop rule as
// RemarkModal: only a press that starts on the backdrop dismisses it.
function FullCastModal({ cast, onClose }) {
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
        aria-label="Full cast"
        className="bg-surface border border-border shadow-xl w-full max-w-2xl overflow-hidden m-4"
      >
        <div className="px-6 py-3 border-b border-border flex justify-between items-center">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Full cast · {cast.length}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-faint hover:text-text transition px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-2">
          {cast.map((row) => (
            <CastRow key={row.system_id} row={row} />
          ))}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button kind="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// Renders nothing when the entry has no cast — an empty "Cast" slip would
// just be a title over a blank box, same rule NovelUnitsCard follows for
// units. A row's voices are a list: one character may have several seiyuu,
// each with a remark saying which ("child", "ep 13-"). Types nobody voices
// simply have none.
//
// Collapsed by default to the Main characters; "Show core cast" widens it to
// Main and Core, and "Show full cast" opens everything in a popup. A cast
// with no Main and no Core character has nothing to collapse to, so it is
// shown whole.
export default function CastSection({ cast }) {
  const [expanded, setExpanded] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  if (!cast || cast.length === 0) return null;

  const sorted = sortCast(cast);
  const main = sorted.filter((row) => COLLAPSED_ROLES.includes(row.role));
  const mainAndCore = sorted.filter((row) => EXPANDED_ROLES.includes(row.role));
  const tiered = mainAndCore.length > 0;
  // With no Main character, Core is the smallest tier there is.
  const collapsed = main.length > 0 ? main : mainAndCore;
  const shown = !tiered ? sorted : expanded ? mainAndCore : collapsed;
  const coreCount = mainAndCore.length - collapsed.length;
  const hiddenCount = sorted.length - shown.length;

  return (
    <Slip title="Cast">
      <div className="space-y-2">
        {shown.map((row) => (
          <CastRow key={row.system_id} row={row} />
        ))}
      </div>
      {tiered && (coreCount > 0 || hiddenCount > 0) && (
        <div className="flex gap-4 mt-3">
          {coreCount > 0 &&
            (expanded ? (
              <button type="button" className={toggleCls} onClick={() => setExpanded(false)}>
                Show main cast only
              </button>
            ) : (
              <button type="button" className={toggleCls} onClick={() => setExpanded(true)}>
                Show core cast (+{coreCount})
              </button>
            ))}
          {hiddenCount > 0 && (
            <button type="button" className={toggleCls} onClick={() => setFullOpen(true)}>
              Show full cast ({sorted.length})
            </button>
          )}
        </div>
      )}
      {fullOpen && <FullCastModal cast={sorted} onClose={() => setFullOpen(false)} />}
    </Slip>
  );
}
