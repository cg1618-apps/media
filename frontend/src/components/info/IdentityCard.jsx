// Frontend: a card for one identity of a character - its photo, display
// name, every other name it goes by, gender and remark - linking to its page.
//
// Shared by the character page's Identities section and the identity page's
// Character section. `to` overrides the link (the identity page's card for
// the character itself points at the character page), and `label` names
// what the card is when that is not obvious ("Character").
import { Link } from "react-router-dom";

import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { entityPath } from "../../lib/entityPath";

export default function IdentityCard({ identity, to, label }) {
  // Every other non-empty name, so an identity known by several is not
  // reduced to the one that happens to be displayed.
  const otherNames = [
    ...new Set(
      ["name_en", "name_cn", "name_jp", "name_alt"]
        .map((field) => identity[field])
        .filter((name) => name && name !== identity.display_name),
    ),
  ];
  // Empty when the row carries no public_id: the card renders as plain
  // markup rather than a link to nowhere.
  const path = to ?? entityPath("identity", identity);
  const Wrapper = path ? Link : "div";
  const wrapperProps = path ? { to: path } : {};
  return (
    <Wrapper
      {...wrapperProps}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col"
    >
      <div className="bg-surface-2 overflow-hidden" style={{ aspectRatio: "2/3" }}>
        <img
          loading="lazy"
          src={getCoverUrl(identity.display_photo_file)}
          alt=""
          className="w-full h-full object-cover"
          style={focusStyle(identity.display_photo_focus)}
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="p-2.5 flex flex-col gap-1 border-t border-border">
        {label && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
            {label}
          </span>
        )}
        <h3 className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight">
          {identity.display_name}
        </h3>
        {otherNames.map((name) => (
          <span key={name} className="text-xs text-text-muted line-clamp-1">
            {name}
          </span>
        ))}
        {identity.display_gender && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
            {identity.display_gender}
          </span>
        )}
        {identity.remark && <p className="text-xs text-text-muted whitespace-pre-line">{identity.remark}</p>}
      </div>
    </Wrapper>
  );
}
