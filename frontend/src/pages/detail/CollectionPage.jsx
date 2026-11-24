// Frontend: page component file for CollectionPage.
//
// The Collection hub. Same shape as the Franchise and Series hubs - cover,
// identity block, two-group tab bar, section slips - but a
// collection groups franchises rather than media entries, so its contents
// group holds the one "Franchises" tab instead of a tab per media type, and
// there are no status filters or roll-up statistics. Clicking a member card
// lands on the normal Franchise hub.
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import {
  getDisplayName,
  getNamingFields,
} from "../../utils/media";
import { compareGroups } from "../../lib/groupSort";
import {
  MY_RATINGS,
  FRANCHISE_EXPECTATIONS,
} from "../../config/fieldOptions";
import {
  getFranchiseCover,
  getCollectionCover,
  withMediaType,
} from "../../lib/covers";
import RelationGraph from "../../components/relations/RelationGraph";
import {
  HubShell,
  GRID_CLS,
  SELECT_CLS,
  Crumbs,
  AdminStrip,
  HeroCover,
  Field,
  HubTabs,
  Section,
} from "../../components/hub/HubChrome";
import { HubLoading, HubError } from "../../components/hub/HubStates";
import {
  Eyebrow,
  Slip,
} from "../../components/ui/primitives";
import FranchiseCard from "../../components/cards/FranchiseCard";
import NeedsWorkBadge from "../../components/needs-work/NeedsWorkBadge";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import OrderSection from "../../components/tracker/OrderSection";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import CollectionNotes from "./CollectionNotes";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useViewScope } from "../../hooks/useViewScope";
import { useMyRatingSaver } from "../../api/mutations/useMyRatingMutations";

export default function CollectionPage() {
  const { publicId } = useParams();
  const { isAdmin } = useAuth();
  // The rating and expectation are the viewer's own, drawn and edited by a
  // holder of self.list; anyone else has none.
  const { ownData } = useViewScope();

  const [collection, setCollection] = useState(null);
  const [members, setMembers] = useState([]);
  const [allEntriesDict, setAllEntriesDict] = useState({});
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
  const [activeTab, setActiveTab] = useState("Franchises");
  // The member franchises' rating and expectation are the viewer's own, so
  // without own data only the title sort is offered and applied.
  const [memberSort, setMemberSort] = useState("title");
  const sort = ownData ? memberSort : "title";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = collection?.system_id;
  const saveMyRating = useMyRatingSaver("collection", system_id, setCollection);

  useCanonicalPath("collection", collection);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. The list filters below still key on the collection's
        // UUID, so they have to wait for the row the detail call resolves
        // rather than run beside it.
        const collectionRes = await fetch(
          endpoints.resource("collection").detail(publicId),
          { credentials: "include" },
        );
        if (collectionRes.status === 404)
          throw new Error("Collection not found");
        if (!collectionRes.ok) throw new Error("Failed to load data");
        const collectionData = await collectionRes.json();
        const resolvedId = collectionData.system_id;

        const responses = await Promise.all([
          fetch(
            buildUrl(endpoints.resource("franchise").list(), {
              collection_id: resolvedId,
              limit: 2000,
            }),
            { credentials: "include" },
          ),
          fetch("/api/anime/?limit=2000", { credentials: "include" }),
          fetch("/api/anime-movie/?limit=2000", { credentials: "include" }),
          fetch("/api/movies/?limit=2000", { credentials: "include" }),
          fetch("/api/tv-shows/?limit=2000", { credentials: "include" }),
          fetch("/api/cartoon/?limit=2000", { credentials: "include" }),
          fetch("/api/manga/?limit=2000", { credentials: "include" }),
          fetch("/api/book/?limit=2000", { credentials: "include" }),
          fetch("/api/comic/?limit=2000", { credentials: "include" }),
        ]);

        if (responses.some((r) => !r.ok)) throw new Error("Failed to load data");

        const [
          franchises,
          anime,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          books,
          comics,
        ] = await Promise.all(responses.map((r) => r.json()));

        // Tagged with the media type each list was fetched as: covers live
        // in owner-typed folders, so the cover fallback needs it.
        const allEntries = [
          ...withMediaType(anime, "anime"),
          ...withMediaType(animeMovies, "anime-movie"),
          ...withMediaType(movies, "movie"),
          ...withMediaType(tvShows, "tv-show"),
          ...withMediaType(cartoons, "cartoon"),
          ...withMediaType(mangas, "manga"),
          ...withMediaType(books, "book"),
          ...withMediaType(comics, "comic"),
        ];

        if (cancelled) return;
        setCollection(collectionData);
        setMembers(franchises);
        setAllEntriesDict(
          Object.fromEntries(allEntries.map((e) => [e.system_id, e])),
        );

        const byFranchise = {};
        for (const e of allEntries) {
          if (!e.franchise_id) continue;
          if (!byFranchise[e.franchise_id]) byFranchise[e.franchise_id] = [];
          byFranchise[e.franchise_id].push(e);
        }
        setAllEntriesByFranchise(byFranchise);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // The cover fallback reads the title order, so it stays independent of the
  // sort the viewer picks for the grid.
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => compareGroups(a, b, "title", "franchise")),
    [members],
  );
  const displayedMembers = useMemo(
    () => [...members].sort((a, b) => compareGroups(a, b, sort, "franchise")),
    [members, sort],
  );

  // The heading's name, which the browser tab shows too.
  const name = collection
    ? getDisplayName(collection, "collection") || "Unknown Collection"
    : null;
  usePageTitle(loading || error ? null : name);

  if (loading) return <HubLoading label="Loading collection..." />;

  if (error || !collection)
    return (
      <HubError
        title="Error loading collection"
        message={error || "Collection not found"}
        backTo="/library/collection"
        backLabel="Collection library"
      />
    );

  // The collection has no cover of its own: the shared helper borrows one from
  // its chosen (or first usable) member franchise.
  const cover = getCollectionCover(
    collection,
    sortedMembers,
    allEntriesDict,
    allEntriesByFranchise,
  );

  const altNames = getNamingFields(collection, "collection").filter(
    (f) => f.value && f.value !== name,
  );

  return (
    <HubShell>
      <Crumbs
        trail={[{ to: "/library/collection", label: "Collection" }]}
        current={name}
        action={
          <div className="flex shrink-0 items-center gap-3">
            <NeedsWorkBadge ownerType="collection" ownerId={collection.system_id} />
            <ReportProblemButton
              targetType="collection"
              targetId={collection.system_id}
              targetLabel={name}
            />
          </div>
        }
      />

      {isAdmin && <AdminStrip editId={collection.system_id} />}

      {/* Hero: the cover, then the identity block */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <HeroCover
            cover={cover}
            rating={ownData ? collection.my_rating : null}
          />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <header>
            <div className="font-mono text-[11px] text-text-muted mb-3">
              Collection
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {name}
            </h1>
            {altNames.length > 0 && (
              <div className="space-y-0.5 mb-4">
                {altNames.map((f) => (
                  <p
                    key={f.label}
                    className="text-lg text-text-muted truncate flex items-baseline gap-2"
                  >
                    <Eyebrow className="shrink-0">{f.label}</Eyebrow>
                    {f.value}
                  </p>
                ))}
              </div>
            )}

            {/* A collection's labels hide the collection AND every franchise,
                series and entry in it, so they are said in their own row, as
                the Franchise hub says its own. */}
            <ContentLabelChips
              labels={collection.content_labels}
              note="Hides this collection and every franchise, series and entry in it."
              className="mt-4"
            />
          </header>

          {ownData && (
            <Slip title="Personal Status">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Overall rating">
                  <select
                    value={collection.my_rating || ""}
                    onChange={(e) =>
                      saveMyRating(
                        { my_rating: e.target.value || null },
                        "Rating saved",
                      )
                    }
                    className={`${SELECT_CLS} w-full`}
                  >
                    <option value="">Not rated</option>
                    {MY_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Expectation">
                  <select
                    value={collection.collection_expectation || ""}
                    onChange={(e) =>
                      saveMyRating(
                        { expectation: e.target.value || null },
                        "Expectation saved",
                      )
                    }
                    className={`${SELECT_CLS} w-full`}
                  >
                    <option value="">None</option>
                    {FRANCHISE_EXPECTATIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Slip>
          )}
        </div>
      </div>

      {/*
        Same two-group bar as the other two hubs. The contents group is
        "Members" rather than "Media" and holds a single tab, because a
        collection groups franchises instead of media entries.
      */}
      <HubTabs
        groups={[
          { label: "Members", tabs: ["Franchises"], counted: true },
          { label: "Extras", tabs: ["Order", "Relations", "Notes"] },
        ]}
        activeTab={activeTab}
        onSelect={setActiveTab}
        getCount={() => sortedMembers.length}
      />

      {activeTab === "Franchises" && (
        <Section
          title="Franchises"
          count={sortedMembers.length}
        >
          {sortedMembers.length === 0 ? (
            <div className="border border-dashed border-border-strong px-4 py-6 text-center">
              <div className="font-mono text-[11px] text-text-muted mb-1">
                No franchises
              </div>
              <p className="text-sm text-text-faint">
                Nothing is filed under this collection yet. Assign one from the
                Franchise tab on the Modify page.
              </p>
            </div>
          ) : (
            <>
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={sort}
                onChange={(e) => setMemberSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="title">Sort: title</option>
                {ownData && (
                  <option value="my_rating">Sort: my rating</option>
                )}
                {ownData && (
                  <option value="expectation">Sort: expectation</option>
                )}
              </select>
            </div>
            <div className={GRID_CLS}>
              {displayedMembers.map((franchise) => (
                <FranchiseCard
                  key={franchise.system_id}
                  franchise={franchise}
                  cover={getFranchiseCover(
                    franchise,
                    allEntriesDict,
                    allEntriesByFranchise,
                  )}
                />
              ))}
            </div>
            </>
          )}
        </Section>
      )}

      {activeTab === "Order" && (
        <Section
          title="Order"
        >
          <OrderSection collectionId={system_id} />
        </Section>
      )}

      {/*
        Owned by the collection itself. Memes live inside it: the section
        registry gives `memes` to every owner, so the Notes tab renders them
        alongside the rest.
      */}
      {/* ── Relations tab content ────────────────────────────────────────── */}
      {activeTab === "Relations" && (
        <Section
          title="Relations"
        >
          {/* Read-only everywhere outside the admin Relations page, for admins
              too: this is a view of the structure, and curating it belongs in
              one place rather than scattered across every hub. The link is
              the way there, already scoped to this collection. */}
          {isAdmin && (
            <div className="flex justify-end mb-2">
              <Link
                to={`/relations?owner=collection:${system_id}`}
                className="text-xs font-medium text-text-muted hover:text-text whitespace-nowrap"
              >
                Edit relations
              </Link>
            </div>
          )}
          <RelationGraph readOnly scopeType="collection" scopeId={system_id} />
        </Section>
      )}

      {activeTab === "Notes" && (
        <Section
          title="Notes"
        >
          <CollectionNotes
            collection={collection}
          />
        </Section>
      )}
    </HubShell>
  );
}
