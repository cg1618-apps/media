// Frontend: the notes page for every owner type.
//
// The page no longer knows what a section is: the registry comes from
// /api/notes/sections and each section is dispatched on its shape. That is why
// the seven configs/*.js files are gone - the backend owns the structure now.
//
// The fetching, the mutations and the per-section rendering moved to
// NotesContext.jsx, so a screen can render one group somewhere else on the
// page without a second fetch of the same two endpoints. What is left here is
// layout: which sections go in which card.
import { useMemo } from "react";

import { NotesProvider, useNotes } from "./NotesContext";
import { GroupCard } from "./sections/ui";

// Split the flat registry into what the page renders: the Notes card holds
// every ungrouped section, and each group becomes a card of its own BESIDE it -
// 音樂 Music is a peer of Notes, not a section inside it. Groups keep registry
// order, and a group's members need not be adjacent for this split (the page no
// longer walks a run), though the registry keeps them adjacent anyway so the
// order stays readable.
//
// `standalone` is the same lift without the shared card: Resources and
// Questions each stand on their own, so wrapping either in a GroupCard would
// put its label in two stacked headers. Every shape component already draws its
// own SectionCard, so lifting one out of `flat` is all a standalone card is.
function splitBlocks(sections) {
  const flat = [];
  const groups = [];
  const standalone = [];
  const byKey = new Map();
  for (const section of sections) {
    if (!section.group) {
      (section.standalone ? standalone : flat).push(section);
      continue;
    }
    let group = byKey.get(section.group);
    if (!group) {
      group = {
        key: section.group,
        label: section.group_label,
        sections: [],
      };
      byKey.set(section.group, group);
      groups.push(group);
    }
    group.sections.push(section);
  }
  return { flat, groups, standalone };
}

// The spinner keeps the plain card rather than a GroupCard: one counting zero
// rows would collapse over itself while the fetch is still in flight.
const Spinner = () => (
  <div className="bg-surface border border-border">
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted shrink-0">
        Notes
      </h3>
      <span className="flex-1 border-t border-dotted border-border-strong/60" />
    </div>
    <div className="p-4">
      <div className="py-10 text-center text-text-faint">
        <i className="fas fa-circle-notch fa-spin text-xl"></i>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] mt-2">
          Loading notes…
        </p>
      </div>
    </div>
  </div>
);

/**
 * One group's sections, with no card of their own.
 *
 * For a screen that puts a group somewhere other than the run of cards: the
 * game detail page renders 待辦 Todo inside its Progress slip, because how far
 * in I am and what I still mean to do are one question. The caller supplies
 * the surrounding card, so this draws only the sections - each already draws
 * its own SectionCard.
 *
 * Renders nothing while the registry is loading, and nothing when the group
 * holds no section for this owner. An owner type that does not have the group
 * is not an error; it simply has nothing here.
 */
export function NotesGroup({ groupKey }) {
  const { sections, loading, renderSection } = useNotes();
  const mine = useMemo(
    () => sections.filter((s) => s.group === groupKey),
    [sections, groupKey],
  );
  if (loading || !mine.length) return null;
  return <div className="space-y-2">{mine.map(renderSection)}</div>;
}

/**
 * Every card of the notes page, minus whatever the screen renders itself.
 *
 * `hideSections` is the second scoped exception to "the frontend never names
 * sections". It lets an embedding screen suppress a section it already renders
 * itself. Only `remark` needs it today, and it needs it badly - `remark` is a
 * singleton row, and the Add form, the Modify tabs and the hub pages all keep
 * a dedicated remark editor that writes the SAME row through the owner router.
 * Rendering this page's `remark` section beside one of those puts two editors
 * on one row: the dedicated editor submits state captured at page load, so it
 * silently reverts anything typed in the notes box - and when the entry had no
 * remark at load, it submits null and DELETES the row outright. Suppressing
 * the duplicate is what keeps that from happening.
 *
 * `hideGroups` is the same idea one level up, for a screen rendering a whole
 * group elsewhere with `NotesGroup`. The registry still owns the structure in
 * both cases: a caller names something it renders itself, never something new.
 */
export function NotesBlocks({ hideSections = [], hideGroups = [] }) {
  const { sections, loading, error, renderSection, blockCount } = useNotes();

  // Callers pass fresh array literals on every render, so the joins keep this
  // memo from recomputing on identity alone.
  const hiddenKey = hideSections.join(",");
  const hiddenGroupKey = hideGroups.join(",");
  const visibleSections = useMemo(() => {
    const hidden = new Set(hiddenKey ? hiddenKey.split(",") : []);
    const hiddenGroups = new Set(hiddenGroupKey ? hiddenGroupKey.split(",") : []);
    return sections.filter(
      (s) => !hidden.has(s.key) && !hiddenGroups.has(s.group),
    );
  }, [sections, hiddenKey, hiddenGroupKey]);

  const { flat, groups, standalone } = useMemo(
    () => splitBlocks(visibleSections),
    [visibleSections],
  );

  return (
    <>
      {/* Above both cards, not inside Notes: a group card is a sibling of the
          Notes card, so an error raised by a section in one would otherwise
          report itself in the other. */}
      {error && (
        <p className="text-sm text-danger border border-danger bg-danger/10 px-4 py-2">
          {error}
        </p>
      )}
      {/* The Notes card wears the group chrome so it collapses when empty like
          every other card - minus the count badge, which it has never had.

          Held back entirely when it owns no section. An owner type whose only
          ungrouped section is `remark` - comic is the one today - ends up with
          nothing here once an embedding page hides `remark` via hideSections,
          and a headed card with no body inside it reads as a bug beside the
          group cards that do have one. */}
      {loading ? (
        <Spinner />
      ) : (
        flat.length > 0 && (
          <GroupCard label="Notes" count={blockCount(flat)} showCount={false}>
            {flat.map(renderSection)}
          </GroupCard>
        )
      )}
      {!loading &&
        groups.map((group) => (
          <GroupCard
            key={group.key}
            label={group.label}
            count={blockCount(group.sections)}
          >
            {group.sections.map(renderSection)}
          </GroupCard>
        ))}
      {!loading && standalone.map(renderSection)}
    </>
  );
}

/**
 * The whole notes page: its own provider, and every card inside it.
 *
 * This is what the eleven `{Type}Notes.jsx` wrappers render, and it is
 * unchanged for them. A screen that needs one group elsewhere on the page
 * composes `NotesProvider`, `NotesGroup` and `NotesBlocks` itself instead -
 * see `frontend/src/pages/detail/Game.jsx`.
 */
export default function NotesTemplate({
  ownerType,
  ownerId,
  isAdmin,
  hideSections = [],
  hideGroups = [],
}) {
  return (
    <NotesProvider ownerType={ownerType} ownerId={ownerId} isAdmin={isAdmin}>
      <NotesBlocks hideSections={hideSections} hideGroups={hideGroups} />
    </NotesProvider>
  );
}
