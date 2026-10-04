// Frontend: the rows an entry's series and franchise hold in one section,
// shown inside the entry's own card for that section.
//
// Read-only and never mixed in: each group's rows are their own sub-list
// under a heading naming where they come from, after the entry's own rows, and
// they are drawn by the section's own shape component in its read view - no
// handlers, no admin flag, no card (`bare`) - so no row gets an Add, an Edit,
// a Delete or a grip, and no second renderer has to agree with the first.
import { Link } from "react-router-dom";

import { entityPath } from "../../lib/entityPath";
import { SectionCardProvider } from "./sections/ui";

const BARE = { bare: true, appendix: null, appendixCount: 0 };

const OWNER_WORD = { series: "series", franchise: "franchise" };

// `groups` is [{ ownerType, owner, name, notes }] in the order they render
// (series, then franchise), each already narrowed to this section's rows and
// holding at least one. `Component` is the section's shape component.
export default function GroupNotes({ section, groups, Component, optionValues }) {
  return groups.map(({ ownerType, owner, name, notes }) => {
    const label = `From ${OWNER_WORD[ownerType]}: ${name}`;
    const path = entityPath(ownerType, owner);
    return (
      <div
        key={ownerType}
        role="group"
        aria-label={label}
        className="border-t border-dashed border-border-strong pt-2 space-y-2"
      >
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint shrink-0">
            From {OWNER_WORD[ownerType]}
          </span>
          {path ? (
            <Link to={path} className="text-xs text-text-muted hover:text-brand truncate">
              {name}
            </Link>
          ) : (
            <span className="text-xs text-text-muted truncate">{name}</span>
          )}
        </p>
        <SectionCardProvider value={BARE}>
          <Component
            section={section}
            notes={notes}
            optionValues={optionValues}
            isAdmin={false}
          />
        </SectionCardProvider>
      </div>
    );
  });
}
