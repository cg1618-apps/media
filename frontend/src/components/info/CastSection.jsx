// Frontend: the read-only cast list every ACG detail page shows.
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { sortCast } from "../../lib/castOrder";
import { entityPath } from "../../lib/entityPath";
import { focusStyle } from "../../lib/covers";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { Button, Chip, Slip } from "../ui/primitives";

const castLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

// The tiers the slip shows inline. Collapsed is every Main character;
// expanded adds Core. Supporting, Other and role-less rows are only ever in
// the full-cast popup, so a long cast never pushes the page down.
const COLLAPSED_ROLES = ["Main"];
const EXPANDED_ROLES = ["Main", "Core"];

const toggleCls =
  "text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

// The identity rows the "Show identities" toggle folds away: every row cast
// as another identity of a character that also has a main row here. One
// whose character has no main row is how that character appears at all
// (only Edogawa Conan in an entry), so it is never hidden.
function hideableIdentities(cast) {
  const withMainRow = new Set(
    cast.filter((row) => !row.identity_id).map((row) => row.character_id),
  );
  return new Set(
    cast.filter((row) => row.identity_id && withMainRow.has(row.character_id)),
  );
}

// "Show identities (N)" / "Hide identities", shared by the slip and the
// full-cast dialog. Rendered only when there is something to fold.
function IdentityToggle({ showIdentities, hideableCount, onToggle }) {
  if (hideableCount === 0) return null;
  return (
    <button type="button" className={toggleCls} onClick={onToggle}>
      {showIdentities ? "Hide identities" : `Show identities (${hideableCount})`}
    </button>
  );
}

// An identity row is drawn as one, not only named: a dashed frame on its
// thumbnail and a dashed "Identity" tag, the dashed line the cast editor
// gives its identity rows. A main row stays solid.
function CastRow({ row }) {
  const asIdentity = Boolean(row.identity_id);
  return (
    <div className="flex items-center gap-3" data-cast-row>
      <div
        className={`w-10 h-10 shrink-0 bg-surface-2 overflow-hidden rounded${
          asIdentity ? " border border-dashed border-border-strong" : ""
        }`}
        data-identity-thumb={asIdentity || undefined}
      >
        <img
          loading="lazy"
          src={getCoverUrl(row.display_photo_file)}
          alt=""
          className="w-full h-full object-cover"
          style={focusStyle(row.display_photo_focus)}
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        {row.role && <Chip>{row.role}</Chip>}
        {asIdentity && <Chip dashed>Identity</Chip>}
        {/* The casting row carries the target's own public_id and
            display name, so this is the real entity, not a stub. A row
            cast as an identity opens that identity's page. */}
        <Link
          to={
            row.identity_public_id != null
              ? entityPath("identity", {
                  public_id: row.identity_public_id,
                  display_name: row.identity_name,
                })
              : entityPath("character", {
                  public_id: row.character_public_id,
                  display_name: row.character_name,
                })
          }
          className={castLinkCls}
        >
          {row.identity_name || row.character_name || "Unknown"}
        </Link>
        {/* An identity row names its character in words, the vocabulary
            the library's identity card uses, so it does not read as a
            second character. A sibling link, never nested in the one above. */}
        {row.identity_name && (
          <span className="text-text-faint text-xs">
            identity of{" "}
            <Link
              to={entityPath("character", {
                public_id: row.character_public_id,
                display_name: row.character_name,
              })}
              className="hover:text-brand transition"
            >
              {row.character_name || "Unknown"}
            </Link>
          </span>
        )}
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
function FullCastModal({ cast, onClose, identityToggle }) {
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
        <div className="px-6 py-3 border-t border-border flex justify-between items-center gap-4">
          <div>{identityToggle}</div>
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
//
// Identity rows of a character that has its main row here are hidden by
// default (hideableIdentities); "Show identities" brings them back, in the
// slip and the dialog alike. The tiers and their counts are worked out over
// the rows that toggle leaves visible. Not persisted: every page load starts
// with them hidden.
export default function CastSection({ cast }) {
  const [expanded, setExpanded] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [showIdentities, setShowIdentities] = useState(false);
  if (!cast || cast.length === 0) return null;

  const all = sortCast(cast);
  const hideable = hideableIdentities(all);
  const sorted = showIdentities ? all : all.filter((row) => !hideable.has(row));
  const main = sorted.filter((row) => COLLAPSED_ROLES.includes(row.role));
  const mainAndCore = sorted.filter((row) => EXPANDED_ROLES.includes(row.role));
  const tiered = mainAndCore.length > 0;
  // With no Main character, Core is the smallest tier there is.
  const collapsed = main.length > 0 ? main : mainAndCore;
  const shown = !tiered ? sorted : expanded ? mainAndCore : collapsed;
  const coreCount = mainAndCore.length - collapsed.length;
  const hiddenCount = sorted.length - shown.length;
  const identityToggle = (
    <IdentityToggle
      showIdentities={showIdentities}
      hideableCount={hideable.size}
      onToggle={() => setShowIdentities((v) => !v)}
    />
  );

  return (
    <Slip title="Cast">
      <div className="space-y-2">
        {shown.map((row) => (
          <CastRow key={row.system_id} row={row} />
        ))}
      </div>
      {((tiered && (coreCount > 0 || hiddenCount > 0)) || hideable.size > 0) && (
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
          {tiered && hiddenCount > 0 && (
            <button type="button" className={toggleCls} onClick={() => setFullOpen(true)}>
              Show full cast ({sorted.length})
            </button>
          )}
          {identityToggle}
        </div>
      )}
      {fullOpen && (
        <FullCastModal
          cast={sorted}
          onClose={() => setFullOpen(false)}
          identityToggle={identityToggle}
        />
      )}
    </Slip>
  );
}
