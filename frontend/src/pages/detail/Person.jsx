// Frontend: page component file for Person.
//
// A person is a public entity rather than a media entry, so this page is
// hand-built beside the media detail pages instead of coming from one of
// their shapes: the header is a profile, and the body is the entries the
// person is credited on, grouped as GET /api/person/{id}/entries returns them
// — by media type AND role, because one person can be an anime's director and
// a manga's author, and each group carries the label that credit has on that
// media type. A group is titled by its person type in Chinese
// (personTypeLabel: 導演, 作家&畫家), and each card names its media type. A
// seiyuu group is the exception in what it shows: its cards lead with the
// part voiced (VoicedPartCard), the entry beneath it. One credit sort
// (hooks/useCreditSort.js), shared with the studio and publisher pages,
// orders every group alike.
//
// The names lead the Profile card; the person's links (IMDb, MAL, AniList and
// their own pages) are the left column's links card, under My rating
// (components/info/EntityLinksCard.jsx).
//
// Like Studio.jsx it reads the API with plain fetch. An admin can jump to the
// full editor, the same controls Character.jsx has
// (components/info/EntityProfileControls.jsx), and the remark list,
// resources and personal notes are a notes block (NotesTemplate, owner type
// "person"). My rating is the viewer's own, set by a holder of self.list
// through PUT /api/me/ratings. Club membership
// (ClubMembership) is editable here too, through its own endpoints. An
// author's or illustrator's gallery of works (WorkGallery) is shown under it;
// it is edited in the person form, beside the photo.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReportProblemButton from "../../components/requests/ReportProblemButton";

import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { useEntityHref } from "../../lib/entityPath";
import ClubMembership from "../../components/info/ClubMembership";
import VoicedPartCard from "../../components/info/VoicedPartCard";
import WorkGallery from "../../components/info/WorkGallery";
import { personTypeLabel } from "../../components/forms/PersonSubTabBar";
import NotesTemplate from "../notes/NotesTemplate";
import InfoCard from "../../components/info/InfoCard";
import { CreditSortControl } from "../../components/info/CompanyCredits";
import EntityHeading, { creditedEntries } from "../../components/info/EntityHeading";
import EntityLinksCard, { ENTITY_LINKS } from "../../components/info/EntityLinksCard";
import { namingRows } from "../../components/info/NamingCard";
import {
  AdminToolbar,
  RatingSelect,
} from "../../components/info/EntityProfileControls";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow, RatingStamp, eyebrowCls } from "../../components/ui/primitives";
import LazyImage from "../../components/ui/LazyImage";
import { useAuth } from "../../contexts/AuthContext";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useViewScope } from "../../hooks/useViewScope";
import { useCreditSort } from "../../hooks/useCreditSort";
import { useMyRatingSaver } from "../../api/mutations/useMyRatingMutations";

// A credit group's title: its person type in Chinese, as the person
// library's Type filter names it - each of a combined group's roles, joined
// ("作家&畫家" for a manga both written and drawn).
function groupTitle(group) {
  return (group.roles?.length ? group.roles : [group.role]).map(personTypeLabel).join("&");
}

// The studios a person belongs to, each a link to its page when the viewer
// may open studio pages (useEntityHref), plain text otherwise.
function AffiliationLinks({ studios }) {
  const entityHref = useEntityHref();
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {studios.map((s, i) => {
        const path = entityHref("studio", s);
        return (
          <span key={s.system_id}>
            {path ? (
              <Link to={path} className="text-brand hover:underline">
                {s.display_name}
              </Link>
            ) : (
              s.display_name
            )}
            {i < studios.length - 1 && <span aria-hidden="true">,</span>}
          </span>
        );
      })}
    </span>
  );
}

export default function Person() {
  const { publicId } = useParams();
  const [person, setPerson] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();
  // My rating is the viewer's own (self.list), saved through /api/me/ratings.
  const { ownData: canRate } = useViewScope();
  const saveMyRating = useMyRatingSaver("person", person?.system_id, setPerson);
  const creditSort = useCreditSort();

  useCanonicalPath("person", person);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. /entries still speaks UUIDs, so it has to wait for the
        // row the detail call resolves rather than run beside it.
        const personRes = await fetch(endpoints.person.detail(publicId), {
          credentials: "include",
        });
        if (!personRes.ok) throw new Error("Person not found.");
        const personData = await personRes.json();
        const entriesRes = await fetch(
          endpoints.person.entries(personData.system_id),
          { credentials: "include" },
        );
        // The entries call is secondary: a person whose credits fail to load
        // still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setPerson(personData);
        setGroups(entriesData.groups || []);
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

  // The heading's name, which the browser tab shows too.
  const name = person ? person.display_name || "Unknown Person" : null;
  usePageTitle(loading || error ? null : name);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading person..." />;
  }

  if (error || !person) {
    return (
      <MediaLoadingState
        error={error || "Person not found."}
        errorTitle="Error Loading Person"
      />
    );
  }

  // The server resolves the fallback: the chosen entry's cover, then the
  // newest visible one.
  const photoUrl = getCoverUrl(person.display_photo_file ?? person.photo_file);
  const creditTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);
  // The types they are offered under, deduplicated: person_role carries one
  // row per (role, scope) and the label here is the type, not the scope. In
  // Chinese, as the library's Type filter and the credit titles name them.
  const types = [...new Set((person.roles || []).map((r) => r.role))].map(personTypeLabel);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/person" className="hover:text-brand transition">
            People
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {name}
          </span>
        </nav>
        <ReportProblemButton
          targetType="person"
          targetId={person.system_id}
          targetLabel={name}
        />
      </div>

      {isAdmin && (
        <AdminToolbar
          ownerType="person"
          systemId={person.system_id}
          // MAL, then TMDB through the IMDb link, as on save - whatever role
          // the person holds. With neither link there is nothing to fetch.
          onAutofilled={
            person.mal_link || person.mal_id || person.imdb_link || person.imdb_id
              ? setPerson
              : undefined
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN: the profile ========== */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex border border-border bg-surface">
            <div
              className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
              style={{ aspectRatio: "2/3" }}
            >
              <LazyImage
                src={photoUrl}
                alt={`${name} photo`}
                className="w-full h-full object-cover"
                style={focusStyle(person.display_photo_focus ?? person.photo_focus)}
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {person.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={person.my_rating} />
                </div>
              )}
            </div>
          </div>

          {canRate && (
            <RatingSelect
              rating={person.my_rating}
              onChange={(v) => saveMyRating({ my_rating: v }, "Rating saved")}
            />
          )}

          <EntityLinksCard item={person} links={ENTITY_LINKS.person} />
        </div>

        {/* ========== RIGHT COLUMN: facts, then the credits ========== */}
        <div className="lg:col-span-3 space-y-6">
          <EntityHeading kind="Person" count={creditedEntries(creditTotal)} name={name} />

          {/* The names lead the profile, one per line, then the facts. */}
          <InfoCard
            title="Profile"
            fields={[
              ...namingRows("person", person),
              [
                { label: "Gender", value: person.gender },
                { label: "Types", value: types.join(", ") || null },
              ],
              {
                label: "Affiliation",
                value: person.affiliations?.length ? (
                  <AffiliationLinks studios={person.affiliations} />
                ) : null,
              },
            ]}
          />

          {/* The remark list, resources and personal notes
              (app/utils/note_sections.py). */}
          <NotesTemplate ownerType="person" ownerId={person.system_id} />

          <ClubMembership person={person} />

          <WorkGallery person={person} />

          {groups.length === 0 ? (
            <section className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">Empty</Eyebrow>
              <p className="text-sm text-text-muted">No credited entries</p>
            </section>
          ) : (
            <>
              <CreditSortControl creditSort={creditSort} />
              {groups.map((group) => (
                <section key={`${group.media_type}:${group.role}`}>
                  <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] text-text-muted">
                    {groupTitle(group)}
                    <span className="text-text-faint">{group.entries.length}</span>
                    <span className="flex-1 border-t border-dotted border-border-strong/60" />
                  </h2>
                  {group.entries.length === 0 ? (
                    <p className="text-sm text-text-faint italic">
                      Nothing you can see here.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                      {creditSort.sorted(group.entries, group.media_type).map((entry) =>
                        group.role === "seiyuu" ? (
                          <VoicedPartCard
                            key={entry.casting_id}
                            entry={entry}
                            navPath={group.nav_path}
                          />
                        ) : (
                          <CreditCard
                            key={entry.system_id}
                            entry={entry}
                            mediaType={group.media_type}
                            navPath={group.nav_path}
                          />
                        ),
                      )}
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A minimal cover-and-title card, naming the entry's media type beneath its
// title: a person's groups are titled by role alone, so the card says which
// kind of work it is.
function CreditCard({ entry, mediaType, navPath }) {
  const title = entry.display_name || "Untitled";
  const card = (
    <>
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
      <div className="p-2.5 flex flex-col gap-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={title}
        >
          {title}
        </h3>
        <span className={eyebrowCls}>{mediaTypeLabel(mediaType)}</span>
      </div>
    </>
  );

  if (!navPath) {
    return <div className="bg-surface border border-border">{card}</div>;
  }
  return (
    <Link
      to={`${navPath}/${entry.system_id}`}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col"
    >
      {card}
    </Link>
  );
}
