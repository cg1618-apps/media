// Frontend: page component file for Publisher.
//
// A publisher is a public entity rather than a media entry, so this page is
// hand-built beside the media detail pages, exactly as pages/detail/Studio.jsx
// is: the header is a profile, and the body is the entries the publisher is
// credited on, grouped by media type as GET /api/publisher/{id}/entries
// returns them.
//
// As on Studio, each entry is drawn as its type's library card without the
// tracker (components/info/CompanyCredits.jsx) under one shared credit sort,
// and the left column holds the logo, My rating, the links card
// (components/info/EntityLinksCard.jsx), then the Related companies.
//
// Two divergences from Studio: the links card carries the website alone - MAL
// has no record of a games publisher or a Taiwanese distributor, so a
// publisher carries no mal_id/mal_link at all - and the Profile is one row of
// country, the media types it is offered on (`scopes`), and active span.
//
// An admin gets the controls Person.jsx has (EntityProfileControls): the jump
// to the full editor. The remark list, resources and personal notes are a
// notes block (NotesTemplate, owner type "publisher"). My rating is the
// viewer's own, set by a holder of self.list through PUT /api/me/ratings.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import NotesTemplate from "../notes/NotesTemplate";
import InfoCard from "../../components/info/InfoCard";
import CompanyCredits from "../../components/info/CompanyCredits";
import EntityHeading, { creditedEntries } from "../../components/info/EntityHeading";
import EntityLinksCard, { ENTITY_LINKS } from "../../components/info/EntityLinksCard";
import RelatedRecords from "../../components/info/RelatedRecords";
import NamingCard from "../../components/info/NamingCard";
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

// "founded – defunct", or "Since founded" while the publisher still trades.
// Both empty means the row is dropped entirely rather than shown as a dash.
function lifespan(publisher) {
  const { founded_date: founded, defunct_date: defunct } = publisher;
  if (founded && defunct) return `${founded} – ${defunct}`;
  if (founded) return `Since ${founded}`;
  if (defunct) return `Until ${defunct}`;
  return null;
}

export default function Publisher() {
  const { publicId } = useParams();
  const [publisher, setPublisher] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();
  // My rating is the viewer's own (self.list), saved through /api/me/ratings.
  const { ownData: canRate } = useViewScope();
  const saveMyRating = useMyRatingSaver("publisher", publisher?.system_id, setPublisher);

  useCanonicalPath("publisher", publisher);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. /entries still speaks UUIDs, so it has to wait for the
        // row the detail call resolves rather than run beside it.
        const publisherRes = await fetch(endpoints.publisher.detail(publicId), {
          credentials: "include",
        });
        if (!publisherRes.ok) throw new Error("Publisher not found.");
        const publisherData = await publisherRes.json();
        const entriesRes = await fetch(
          endpoints.publisher.entries(publisherData.system_id),
          { credentials: "include" },
        );
        // The entries call is secondary: a publisher whose credits fail to
        // load still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setPublisher(publisherData);
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
  const name = publisher ? publisher.display_name || "Unknown Publisher" : null;
  usePageTitle(loading || error ? null : name);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading publisher..." />;
  }

  if (error || !publisher) {
    return (
      <MediaLoadingState
        error={error || "Publisher not found."}
        errorTitle="Error Loading Publisher"
      />
    );
  }

  const logoUrl = getCoverUrl(publisher.display_logo_file ?? publisher.logo_file);
  const span = lifespan(publisher);
  const creditTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/publisher" className="hover:text-brand transition">
            Publishers
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {name}
          </span>
        </nav>
        <ReportProblemButton
          targetType="publisher"
          targetId={publisher.system_id}
          targetLabel={name}
        />
      </div>

      {isAdmin && <AdminToolbar ownerType="publisher" systemId={publisher.system_id} />}

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
                style={focusStyle(publisher.display_logo_focus ?? publisher.logo_focus)}
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {publisher.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={publisher.my_rating} />
                </div>
              )}
            </div>
          </div>

          {canRate && (
            <RatingSelect
              rating={publisher.my_rating}
              onChange={(v) => saveMyRating({ my_rating: v }, "Rating saved")}
            />
          )}

          <EntityLinksCard item={publisher} links={ENTITY_LINKS.publisher} />

          <RelatedRecords
            type="publisher"
            recordId={publisher.system_id}
            isAdmin={isAdmin}
          />

          <NamingCard type="publisher" item={publisher} />
        </div>

        {/* ========== RIGHT COLUMN: facts, then the credits ========== */}
        <div className="lg:col-span-3 space-y-6">
          <EntityHeading
            kind="Publisher"
            count={creditedEntries(creditTotal)}
            name={name}
          />

          <InfoCard
            title="Profile"
            fields={[
              [
                { label: "Country", value: publisher.country },
                {
                  label: "Types",
                  value:
                    (publisher.scopes || []).map(mediaTypeLabel).join(", ") || null,
                },
                { label: "Active", value: span },
              ],
            ]}
          />

          {/* The remark list, resources and personal notes
              (app/utils/note_sections.py). */}
          <NotesTemplate ownerType="publisher" ownerId={publisher.system_id} />

          <CompanyCredits groups={groups} />
        </div>
      </div>
    </div>
  );
}
