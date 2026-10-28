// Frontend: one part a seiyuu voiced, on the person page.
//
// The part leads, not the entry: the picture is the character as cast there
// (the casting's photo, else the identity's, else the character's - resolved
// by the server), and the heading is who the part is. The entry it was voiced
// in is the complement, a small cover-and-title line at the foot.
//
// The name follows the entry cast table (CastSection's CastRow): a credited
// name leads, the identity's (else the character's) own name beneath it, and
// an identity is drawn with a dashed frame and says whose identity it is.
// Every link is a sibling, never nested - an <a> inside an <a> is invalid.
import { Link } from "react-router-dom";

import { getCoverUrl, FALLBACK_SVG, focusStyle, thumbUrl } from "../../lib/covers";
import { entityPath } from "../../lib/entityPath";
import { releaseYear } from "../../lib/releaseDate";
import { Chip } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";

export default function VoicedPartCard({ entry, navPath }) {
  const asIdentity = Boolean(entry.identity_id);
  const ownName = entry.identity_name || entry.character_name || "Unknown";
  const partPath =
    entry.identity_public_id != null
      ? entityPath("identity", {
          public_id: entry.identity_public_id,
          display_name: entry.identity_name,
        })
      : entityPath("character", {
          public_id: entry.character_public_id,
          display_name: entry.character_name,
        });
  const characterPath = entityPath("character", {
    public_id: entry.character_public_id,
    display_name: entry.character_name,
  });
  const title = entry.display_name || "Untitled";
  const year = releaseYear(entry.release_date);

  const photo = (
    <div
      className={`bg-surface-2 overflow-hidden${
        asIdentity ? " outline outline-1 outline-dashed outline-border-strong -outline-offset-4" : ""
      }`}
      style={{ aspectRatio: "2/3" }}
    >
      <LazyImage
        src={thumbUrl(getCoverUrl(entry.display_photo_file))}
        alt={ownName}
        className="w-full h-full object-cover"
        style={focusStyle(entry.display_photo_focus)}
        onError={(e) => {
          e.target.src = FALLBACK_SVG;
        }}
      />
    </div>
  );
  const entryLine = (
    <>
      <div className="w-6 shrink-0 bg-surface-2 overflow-hidden" style={{ aspectRatio: "2/3" }}>
        <LazyImage
          src={thumbUrl(getCoverUrl(entry.cover_image_file))}
          alt=""
          className="w-full h-full object-cover"
          style={focusStyle(entry.cover_image_focus)}
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <span className="min-w-0 flex flex-col">
        <span
          className="text-xs text-text-muted group-hover:text-brand transition-colors line-clamp-2 leading-tight"
          title={title}
        >
          {title}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {year || "Undated"}
        </span>
      </span>
    </>
  );

  return (
    <div
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col"
      data-voiced-part
    >
      {/* The picture repeats the name link below it, so it is left out of
          the tab order and the accessibility tree rather than read twice. */}
      {partPath ? (
        <Link to={partPath} tabIndex={-1} aria-hidden="true">
          {photo}
        </Link>
      ) : (
        photo
      )}
      <div className="p-2.5 flex flex-col gap-1 border-t border-border flex-1">
        {(entry.character_role || asIdentity) && (
          <div className="flex flex-wrap gap-1">
            {entry.character_role && <Chip>{entry.character_role}</Chip>}
            {asIdentity && <Chip dashed>Identity</Chip>}
          </div>
        )}
        <h3 className="font-display font-semibold text-text text-sm leading-tight line-clamp-2">
          {partPath ? (
            <Link to={partPath} className="hover:text-brand transition-colors">
              {entry.credited_name || ownName}
            </Link>
          ) : (
            entry.credited_name || ownName
          )}
        </h3>
        {entry.credited_name && (
          <span className="text-xs text-text-faint truncate">{ownName}</span>
        )}
        {asIdentity && entry.character_name && (
          <span className="text-xs text-text-faint truncate">
            identity of{" "}
            <Link to={characterPath} className="hover:text-brand transition-colors">
              {entry.character_name}
            </Link>
          </span>
        )}
        {entry.voice_remark && (
          <span className="text-xs text-text-faint">({entry.voice_remark})</span>
        )}
        {/* The cast row's own remark, about the character in this entry -
            the bracketed voice_remark above is about this seiyuu's voice. */}
        {entry.casting_remark && (
          <span
            className="text-xs text-text-muted line-clamp-2 whitespace-pre-line"
            title={entry.casting_remark}
            data-cast-remark
          >
            {entry.casting_remark}
          </span>
        )}
      </div>
      {navPath ? (
        <Link
          to={`${navPath}/${entry.system_id}`}
          className="group flex items-center gap-2 px-2.5 py-2 border-t border-dotted border-border-strong/60"
        >
          {entryLine}
        </Link>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-2 border-t border-dotted border-border-strong/60">
          {entryLine}
        </div>
      )}
    </div>
  );
}
