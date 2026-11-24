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
import { Fragment, useMemo } from "react";

import { NotesProvider, useNotes } from "./NotesContext";
import { GroupCard } from "./sections/ui";
import { TocSection } from "../../components/layout/DetailContents";
import { chineseLabel } from "../../lib/noteLabels";

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
 * `hideGroups` lets a screen that renders a whole group elsewhere with
 * `NotesGroup` keep it out of the run of cards, so it appears exactly once.
 *
 * `beforeGroup` maps a group key to something that is not a note - the game
 * page's cast - drawn just before that group's card, as a sibling of it,
 * never inside it: the card's count, collapse and section list stay the
 * registry's. While the notes load, or when the owner has no such group, it
 * is drawn after the cards instead, so it is never lost.
 * The registry still owns the structure: a caller names a group it renders
 * itself, never something new.
 */
export function NotesBlocks({ hideGroups = [], beforeGroup = {} }) {
  // Each top-level card is a TocSection, so a detail page's table of contents
  // lists the Notes card, every group card and every standalone section - and
  // never a group's own sections, which sit inside its card. The contents
  // list each by the Chinese part of its label (chineseLabel); the card itself
  // keeps the whole label.
  const { sections, loading, error, renderSection, blockCount } = useNotes();

  // Callers pass fresh array literals on every render, so the join keeps this
  // memo from recomputing on identity alone.
  const hiddenGroupKey = hideGroups.join(",");
  const visibleSections = useMemo(() => {
    const hiddenGroups = new Set(hiddenGroupKey ? hiddenGroupKey.split(",") : []);
    return sections.filter((s) => !hiddenGroups.has(s.group));
  }, [sections, hiddenGroupKey]);

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

          Held back entirely when it owns no section: a headed card with no
          body inside it reads as a bug beside the group cards that do have
          one. */}
      {loading ? (
        <Spinner />
      ) : (
        flat.length > 0 && (
          <TocSection id="notes" label="Notes">
            <GroupCard label="Notes" count={blockCount(flat)} showCount={false}>
              {flat.map(renderSection)}
            </GroupCard>
          </TocSection>
        )
      )}
      {!loading &&
        groups.map((group) => (
          <Fragment key={group.key}>
          {beforeGroup[group.key]}
          <TocSection id={`notes-${group.key}`} label={chineseLabel(group.label)}>
            <GroupCard
              label={group.label}
              count={blockCount(group.sections)}
              // A group holding a list with its own status (音樂 Music) opens
              // when empty too, or the statuses its lists open for stay hidden.
              openWhenEmpty={group.sections.some((s) => s.type_status_section)}
            >
              {group.sections.map(renderSection)}
            </GroupCard>
          </TocSection>
          </Fragment>
        ))}
      {Object.entries(beforeGroup)
        .filter(([key]) => loading || !groups.some((g) => g.key === key))
        .map(([key, node]) => (
          <Fragment key={`before-${key}`}>{node}</Fragment>
        ))}
      {!loading &&
        standalone.map((section) => (
          <TocSection
            key={section.key}
            id={`notes-${section.key}`}
            label={chineseLabel(section.label)}
          >
            {renderSection(section)}
          </TocSection>
        ))}
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
  hideGroups = [],
  owner,
  nameSuggestions,
  groupOrder,
  onGroupOrderChange,
  series,
  franchise,
}) {
  return (
    <NotesProvider
      ownerType={ownerType}
      ownerId={ownerId}
      owner={owner}
      nameSuggestions={nameSuggestions}
      groupOrder={groupOrder}
      onGroupOrderChange={onGroupOrderChange}
      series={series}
      franchise={franchise}
    >
      <NotesBlocks hideGroups={hideGroups} />
    </NotesProvider>
  );
}
