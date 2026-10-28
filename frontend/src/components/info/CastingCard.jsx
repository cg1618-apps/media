// Frontend: one appearance on a character or identity page.
//
// A minimal cover-and-title card, plus the seiyuu who voiced the part in this
// entry. MediaCard is deliberately not reused, same reasoning as Person.jsx's
// CreditCard and Studio.jsx's card: the entries endpoints return a handful of
// flat keys, not a full media payload.
//
// The "as ..." line names who the part is in this entry: the casting's
// credited name when it has one (what the entry calls the character), else
// the identity it is cast as. `hideIdentity` drops the identity from it, for
// the identity page, where every row is that identity and it would only
// repeat the headline; a credited name is still shown there.
import { Link } from "react-router-dom";

import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { entityPath } from "../../lib/entityPath";
import { releaseYear } from "../../lib/releaseDate";
import LazyImage from "../ui/LazyImage";

export default function CastingCard({ entry, navPath, hideIdentity = false }) {
  const title = entry.display_name || "Untitled";
  const year = releaseYear(entry.release_date);
  const cover = (
    <div
      className="bg-surface-2 overflow-hidden"
      style={{ aspectRatio: "2/3" }}
    >
      <LazyImage
        src={getCoverUrl(entry.cover_image_file)}
        alt=""
        className="w-full h-full object-cover"
        style={focusStyle(entry.cover_image_focus)}
        onError={(e) => {
          e.target.src = FALLBACK_SVG;
        }}
      />
    </div>
  );
  const facts = (
    <>
      <h3
        className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
        title={title}
      >
        {title}
      </h3>
      {entry.credited_name ? (
        <span className="text-xs text-text-muted truncate">
          as {entry.credited_name}
          {!hideIdentity && entry.identity_name && (
            <span className="text-text-faint"> · {entry.identity_name}</span>
          )}
        </span>
      ) : (
        !hideIdentity &&
        entry.identity_name && (
          <span className="text-xs text-text-muted truncate">as {entry.identity_name}</span>
        )
      )}
      {entry.remark && (
        <span
          className="text-xs text-text-muted line-clamp-2 whitespace-pre-line"
          title={entry.remark}
          data-cast-remark
        >
          {entry.remark}
        </span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {year || "Undated"}
      </span>
    </>
  );

  // The entry cover/title link and the seiyuu links are siblings, never
  // nested: an <a> inside an <a> is invalid HTML and would swallow the
  // seiyuu links' clicks into the entry link's. One character may have
  // several seiyuu in one entry, each listed with the remark that tells
  // them apart.
  return (
    <div className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col">
      {navPath ? (
        <Link to={`${navPath}/${entry.system_id}`} className="flex flex-col">
          {cover}
          <div className="p-2.5 flex flex-col gap-1 border-t border-border">
            {facts}
          </div>
        </Link>
      ) : (
        <>
          {cover}
          <div className="p-2.5 flex flex-col gap-1 border-t border-border">
            {facts}
          </div>
        </>
      )}
      {entry.seiyuu?.length > 0 && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-0.5">
          {entry.seiyuu.map((seiyuu) => (
            <Link
              key={seiyuu.system_id}
              to={entityPath("person", {
                public_id: seiyuu.public_id,
                display_name: seiyuu.display_name,
              })}
              className="text-xs text-text-muted hover:text-brand transition-colors truncate"
            >
              {seiyuu.display_name}
              {seiyuu.remark && <span className="text-text-faint"> ({seiyuu.remark})</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
