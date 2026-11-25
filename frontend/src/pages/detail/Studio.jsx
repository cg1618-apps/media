// Frontend: page component file for Studio.
//
// A studio is a public entity rather than a media entry, so this page is
// hand-built beside the media detail pages instead of coming from one of
// their shapes: the header is a profile, and the body is the entries the
// studio is credited on, grouped by media type exactly as
// GET /api/studio/{id}/entries returns them.
//
// Each entry is drawn as its type's library card without the tracker
// (components/info/CompanyCredits.jsx), under one shared credit sort. The left
// column holds the logo, My rating, the links card (website, MAL, AniList -
// components/info/EntityLinksCard.jsx), then the Related companies, as a
// media entry's left column holds its Sources then its Related Entries.
//
// Like Person.jsx it reads the API with plain fetch. An admin can jump to the
// full editor, the controls Person.jsx and Character.jsx have
// (components/info/EntityProfileControls.jsx), and the remark list,
// resources and personal notes are a notes block (NotesTemplate, owner type
// "studio"). My rating is the viewer's own, set by a holder of self.list
// through PUT /api/me/ratings.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import NotesTemplate from "../notes/NotesTemplate";
import InfoCard from "../../components/info/InfoCard";
import CompanyCredits from "../../components/info/CompanyCredits";
import EntityHeading, { creditedEntries } from "../../components/info/EntityHeading";
import EntityLinksCard, { ENTITY_LINKS } from "../../components/info/EntityLinksCard";
import NamingCard from "../../components/info/NamingCard";
import RelatedRecords from "../../components/info/RelatedRecords";
import AffiliatedPeople from "../../components/info/AffiliatedPeople";
import {
  AdminToolbar,
  RatingSelect,
} from "../../components/info/EntityProfileControls";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { RatingStamp } from "../../components/ui/primitives";
import LazyImage from "../../components/ui/LazyImage";
import { useAuth } from "../../contexts/AuthContext";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useViewScope } from "../../hooks/useViewScope";
import { useMyRatingSaver } from "../../api/mutations/useMyRatingMutations";
import { formatCountries } from "../../lib/countries";

// "founded – defunct", or "Since founded" while the studio is still working.
// Both empty means the row is dropped entirely rather than shown as a dash.
function lifespan(studio) {
  const { founded_date: founded, defunct_date: defunct } = studio;
  if (founded && defunct) return `${founded} – ${defunct}`;
  if (founded) return `Since ${founded}`;
  if (defunct) return `Until ${defunct}`;
  return null;
}

export default function Studio() {
  const { publicId } = useParams();
  const [studio, setStudio] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();
  // My rating is the viewer's own (self.list), saved through /api/me/ratings.
  const { ownData: canRate } = useViewScope();
  const saveMyRating = useMyRatingSaver("studio", studio?.system_id, setStudio);

  useCanonicalPath("studio", studio);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. /entries still speaks UUIDs, so it has to wait for the
        // row the detail call resolves rather than run beside it.
        const studioRes = await fetch(endpoints.studio.detail(publicId), {
          credentials: "include",
        });
        if (!studioRes.ok) throw new Error("Studio not found.");
        const studioData = await studioRes.json();
        const entriesRes = await fetch(
          endpoints.studio.entries(studioData.system_id),
          { credentials: "include" },
        );
        // The entries call is secondary: a studio whose credits fail to load
        // still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setStudio(studioData);
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
  const name = studio ? studio.display_name || "Unknown Studio" : null;
  usePageTitle(loading || error ? null : name);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading studio..." />;
  }

  if (error || !studio) {
    return (
      <MediaLoadingState
        error={error || "Studio not found."}
        errorTitle="Error Loading Studio"
      />
    );
  }

  const logoUrl = getCoverUrl(studio.display_logo_file ?? studio.logo_file);
  const span = lifespan(studio);
  const creditTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/studio" className="hover:text-brand transition">
            Studios
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {name}
          </span>
        </nav>
        <ReportProblemButton
          targetType="studio"
          targetId={studio.system_id}
          targetLabel={name}
        />
      </div>

      {isAdmin && (
        <AdminToolbar
          ownerType="studio"
          systemId={studio.system_id}
          // Only a studio with a MAL producer to fetch from offers it.
          onAutofilled={studio.mal_link || studio.mal_id ? setStudio : undefined}
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
                src={logoUrl}
                alt={`${name} logo`}
                className="w-full h-full object-cover"
                style={focusStyle(studio.display_logo_focus ?? studio.logo_focus)}
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {studio.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={studio.my_rating} />
                </div>
              )}
            </div>
          </div>

          {canRate && (
            <RatingSelect
              rating={studio.my_rating}
              onChange={(v) => saveMyRating({ my_rating: v }, "Rating saved")}
            />
          )}

          <EntityLinksCard item={studio} links={ENTITY_LINKS.studio} />

          <RelatedRecords type="studio" recordId={studio.system_id} isAdmin={isAdmin} />

          <NamingCard type="studio" item={studio} />
        </div>

        {/* ========== RIGHT COLUMN: facts, then the credits ========== */}
        <div className="lg:col-span-3 space-y-6">
          <EntityHeading kind="Studio" count={creditedEntries(creditTotal)} name={name} />

          <InfoCard
            title="Profile"
            fields={[
              [
                { label: "Countries", value: formatCountries(studio.countries) },
                { label: "Active", value: span },
              ],
            ]}
          />

          {/* The remark list, resources and personal notes
              (app/utils/note_sections.py). */}
          <NotesTemplate ownerType="studio" ownerId={studio.system_id} />

          <AffiliatedPeople studioId={studio.system_id} />

          <CompanyCredits groups={groups} />
        </div>
      </div>
    </div>
  );
}
