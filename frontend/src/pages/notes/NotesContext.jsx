// Frontend: the notes page's data, lifted out of the page that used to own it.
//
// `NotesTemplate` fetched the registry and the rows itself, which was fine
// while every screen rendered the whole page in one place. The game detail
// page does not: 待辦 Todo renders inside the Progress slip at the top and
// everything else renders at the bottom. Two `NotesTemplate`s would mean two
// fetches of the same two endpoints, two loading states and two error
// banners for one page.
//
// So the fetching, the mutations and the per-section rendering live here, and
// the layout components below are the things that get composed. `NotesTemplate`
// still wraps a provider around its own blocks, so the eleven owner-type
// wrappers are unchanged and no other screen had to learn about any of this.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as api from "./api";
import TextSection from "./sections/TextSection";
import TextLinksSection from "./sections/TextLinksSection";
import EpisodeTextSection from "./sections/EpisodeTextSection";
import NameLinksSection from "./sections/NameLinksSection";
import NameEntriesSection from "./sections/NameEntriesSection";
import StructuredSection from "./sections/StructuredSection";
import MusicTrackSection from "./sections/MusicTrackSection";
import QuoteSection from "./sections/QuoteSection";
import MemeSection from "./sections/MemeSection";

const SHAPES = {
  text: TextSection,
  text_links: TextLinksSection,
  episode_text: EpisodeTextSection,
  name_links: NameLinksSection,
  name_entries: NameEntriesSection,
  music_track: MusicTrackSection,
  structured: StructuredSection,
};

// The first of two deliberate, scoped exceptions to "the frontend never names
// sections". (The second is the `hideSections` prop on NotesBlocks.)
// The shapes above are fully registry-driven: the backend can add, drop or
// relabel a `text` section and this file never changes. An `external` section
// cannot work that way - quotes and memes are backed by their own tables, their
// own endpoints and their own long-lived components, so rendering one means
// naming a component for it. Keying that off the section key (rather than
// minting a shape per section) keeps the exception to this map: the registry
// still decides whether the section exists at all, where it sits, and what it
// is called, and an external key with no component here degrades to null.
//
// Their props predate this page's shape contract, so each is adapted here
// rather than rewritten. media_type/entry_id and owner_type/owner_id are the
// same hyphenated owner keys the notes API uses.
const EXTERNAL_SHAPES = {
  quotes: ({ label, ownerType, ownerId, isAdmin, onCount }) => (
    <QuoteSection
      label={label}
      mediaType={ownerType}
      entryId={ownerId}
      isAdmin={isAdmin}
      onCount={onCount}
    />
  ),
  memes: ({ label, ownerType, ownerId, isAdmin, onCount }) => (
    <MemeSection
      label={label}
      ownerType={ownerType}
      ownerId={ownerId}
      isAdmin={isAdmin}
      onCount={onCount}
    />
  ),
};

const NotesContext = createContext(null);

// `notes` with one section's rows put in `orderedIds` order, every other row
// where it was. The page draws a section in array order, so this is how a
// reorder shows before the server has answered. Ids not in the section are
// ignored; a row the list does not name keeps its place after those it does.
export function withSectionOrder(notes, section, orderedIds) {
  const position = new Map(orderedIds.map((id, i) => [id, i]));
  const rank = (n) => position.get(n.system_id) ?? orderedIds.length;
  const sorted = notes
    .filter((n) => n.section === section)
    .sort((a, b) => rank(a) - rank(b));
  let next = 0;
  return notes.map((n) => (n.section === section ? sorted[next++] : n));
}

// Whether a section applies to this owner ROW, not just this owner type.
// `owner_where` ({column: [allowed values]}) narrows a section to some rows of
// its owner types - 亮點 Highlights is KR h-comics only - and the server
// refuses a note on any other row (422). Without the row there is nothing to
// test, so the section is kept, as it always was.
export function ownerMatches(section, owner) {
  const where = section.owner_where || {};
  if (!owner) return true;
  return Object.entries(where).every(([column, allowed]) =>
    allowed.includes(owner[column]),
  );
}

export function useNotes() {
  const value = useContext(NotesContext);
  if (!value) {
    throw new Error("A notes component was rendered outside NotesProvider.");
  }
  return value;
}

// `owner` is the owner row, for `owner_where`. The next three feed the
// structured shape and only matter to a section declaring the matching field:
// `nameSuggestions` for a `names` input, and the owner's stored group order
// (`groupOrder`) with the callback that saves a new one (`onGroupOrderChange`)
// for a section with `group_by`. An owner type has at most one grouped
// section, so one order is enough.
export function NotesProvider({
  ownerType,
  ownerId,
  isAdmin,
  owner,
  nameSuggestions,
  groupOrder,
  onGroupOrderChange,
  children,
}) {
  const [allSections, setSections] = useState([]);
  // A `hidden` section (music_status) is never a card of its own: its rows
  // belong to the sections pointing at it through `type_status_section`. It
  // is dropped here, before any layout or count sees it, so it can neither
  // render nor make the Music card count rows it does not show.
  const sections = useMemo(
    () =>
      allSections.filter(
        (section) => !section.hidden && ownerMatches(section, owner),
      ),
    [allSections, owner],
  );
  // {category: [values]} for every option category a section draws
  // suggestions from. Suggestions only, so a category that fails to load is
  // simply an empty list.
  const [optionValues, setOptionValues] = useState({});
  const [notes, setNotes] = useState([]);
  // Quotes and memes live in their own tables, so their rows never arrive in
  // `notes` and the page cannot count them itself. Each external section
  // reports its own count here, which is the only way a card holding one can
  // know whether it is empty.
  const [externalCounts, setExternalCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The sections whose reorder is still being saved. The ref is the guard
  // (read synchronously by onReorder); the state is what the sections render.
  const reorderingRef = useRef(new Set());
  const [reordering, setReordering] = useState(() => new Set());

  // Only the rows change while the page is open, so a mutation refetches them
  // alone; the registry is static for the session.
  const reloadNotes = useCallback(async () => {
    if (!ownerType || !ownerId) return;
    try {
      setNotes(await api.fetchNotes(ownerType, ownerId));
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    // Nothing to fetch without an owner, so stop loading rather than spinning
    // forever: `loading` starts true, and every call site reaches this hook.
    if (!ownerType || !ownerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.fetchSections(ownerType),
      api.fetchNotes(ownerType, ownerId),
    ])
      .then(([secs, rows]) => {
        if (cancelled) return;
        setSections(secs);
        setNotes(rows);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId]);

  useEffect(() => {
    const categories = [
      ...new Set(
        allSections.flatMap((s) => [s.kind_category, s.link_text_category]),
      ),
    ].filter(Boolean);
    if (!categories.length || !ownerType) return;
    let cancelled = false;
    Promise.all(
      categories.map((category) =>
        Promise.resolve(api.fetchOptionValues(category, ownerType))
          .then((values) => [category, Array.isArray(values) ? values : []])
          .catch(() => [category, []]),
      ),
    ).then((entries) => {
      if (!cancelled) setOptionValues(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [allSections, ownerType]);

  const reportCount = useCallback((key, n) => {
    setExternalCounts((prev) => (prev[key] === n ? prev : { ...prev, [key]: n }));
  }, []);
  // One stable callback per section key: an inline lambda would change identity
  // every render and re-fire the reporting effect in every external section.
  const reporters = useRef({});
  const reporterFor = (key) =>
    (reporters.current[key] ||= (n) => reportCount(key, n));

  const bySection = useMemo(() => {
    const map = {};
    for (const n of notes) (map[n.section] ||= []).push(n);
    return map;
  }, [notes]);

  const handlers = useMemo(
    () => ({
      onCreate: async (payload) => {
        try {
          await api.createNote({
            owner_type: ownerType,
            owner_id: ownerId,
            ...payload,
          });
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onUpdate: async (id, payload) => {
        try {
          await api.updateNote(id, payload);
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onDelete: async (id) => {
        try {
          await api.deleteNote(id);
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      // Takes every id of the section in its new order - the endpoint refuses
      // anything else. A hierarchical section flattens its tree depth-first,
      // so sort_index ascends in the order the page draws.
      //
      // One reorder per section at a time. The next move is built from
      // `notes`, so a second one sent before the first has been reloaded would
      // be computed from a stale order and undo it; while a save is in flight
      // the section is told so (`reordering`) and disables its handles, and a
      // call that slips through anyway is dropped here. The new order is
      // applied locally first, so the dropped row stays where it was put;
      // a failed save reloads the stored order and says why.
      onReorder: async (section, orderedIds) => {
        if (reorderingRef.current.has(section)) return;
        reorderingRef.current.add(section);
        setReordering(new Set(reorderingRef.current));
        setNotes((prev) => withSectionOrder(prev, section, orderedIds));
        try {
          await api.reorderNotes(ownerType, ownerId, section, orderedIds);
          await reloadNotes();
        } catch (e) {
          await reloadNotes();
          setError(String(e.message || e));
        } finally {
          reorderingRef.current.delete(section);
          setReordering(new Set(reorderingRef.current));
        }
      },
    }),
    [ownerType, ownerId, reloadNotes],
  );

  const renderSection = (section) => {
    if (section.shape === "external") {
      const External = EXTERNAL_SHAPES[section.key];
      if (!External) return null;
      return (
        <External
          key={section.key}
          label={section.label}
          ownerType={ownerType}
          ownerId={ownerId}
          isAdmin={isAdmin}
          onCount={reporterFor(section.key)}
        />
      );
    }
    const Component = SHAPES[section.shape];
    if (!Component || section.hidden) return null;
    // A song list's own status: the row of its `type_status_section` whose
    // kind is this section's key, or undefined until one is written.
    const typeStatusNote = section.type_status_section
      ? (bySection[section.type_status_section] || []).find(
          (n) => n.kind === section.key,
        )
      : undefined;
    return (
      <Component
        key={section.key}
        section={section}
        notes={bySection[section.key] || []}
        optionValues={optionValues}
        typeStatusNote={typeStatusNote}
        isAdmin={isAdmin}
        nameSuggestions={nameSuggestions}
        groupOrder={groupOrder}
        onGroupOrderChange={onGroupOrderChange}
        reordering={reordering.has(section.key)}
        {...handlers}
      />
    );
  };

  // How many rows a card holds, which is what decides whether it opens
  // collapsed. null means "not known yet": an external section that has not
  // finished loading leaves the whole card unknown, so it stays open rather
  // than collapsing on a count that is about to change.
  const blockCount = (secs) => {
    let total = 0;
    for (const sec of secs) {
      if (sec.shape === "external") {
        const n = externalCounts[sec.key];
        if (n == null) return null;
        total += n;
      } else {
        total += (bySection[sec.key] || []).length;
      }
    }
    return total;
  };

  const value = {
    sections,
    loading,
    error,
    renderSection,
    blockCount,
  };
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}
