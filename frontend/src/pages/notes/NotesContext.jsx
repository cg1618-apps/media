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
import TextOrLinkSection from "./sections/TextOrLinkSection";
import EpisodeTextSection from "./sections/EpisodeTextSection";
import NameLinksSection from "./sections/NameLinksSection";
import NameEntriesSection from "./sections/NameEntriesSection";
import StructuredSection from "./sections/StructuredSection";
import EpisodeNameLinksSection from "./sections/EpisodeNameLinksSection";
import MusicTrackSection from "./sections/MusicTrackSection";
import QuoteSection from "./sections/QuoteSection";
import MemeSection from "./sections/MemeSection";

const SHAPES = {
  text: TextSection,
  text_links: TextLinksSection,
  text_or_link: TextOrLinkSection,
  episode_text: EpisodeTextSection,
  name_links: NameLinksSection,
  name_entries: NameEntriesSection,
  episode_name_links: EpisodeNameLinksSection,
  music_track: MusicTrackSection,
  structured: StructuredSection,
};

// The first of two deliberate, scoped exceptions to "the frontend never names
// sections". (The second is the `hideSections` prop on NotesBlocks.)
// The nine shapes above are fully registry-driven: the backend can add, drop or
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
  const sections = useMemo(
    () => allSections.filter((section) => ownerMatches(section, owner)),
    [allSections, owner],
  );
  const [notes, setNotes] = useState([]);
  // Quotes and memes live in their own tables, so their rows never arrive in
  // `notes` and the page cannot count them itself. Each external section
  // reports its own count here, which is the only way a card holding one can
  // know whether it is empty.
  const [externalCounts, setExternalCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      onReorder: async (section, orderedIds) => {
        try {
          await api.reorderNotes(ownerType, ownerId, section, orderedIds);
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
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
    if (!Component) return null;
    return (
      <Component
        key={section.key}
        section={section}
        notes={bySection[section.key] || []}
        isAdmin={isAdmin}
        nameSuggestions={nameSuggestions}
        groupOrder={groupOrder}
        onGroupOrderChange={onGroupOrderChange}
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
