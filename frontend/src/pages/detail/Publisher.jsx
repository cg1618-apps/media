// Frontend: page component file for Publisher.
//
// A publisher is a public entity rather than a media entry, so this page is
// hand-built beside the media detail pages, exactly as pages/detail/Studio.jsx
// is: the header is a profile, and the body is the entries the publisher is
// credited on, grouped by media type as GET /api/publisher/{id}/entries
// returns them.
//
// Two divergences from Studio: no MAL row in the profile - MAL has no record
// of a games publisher or a Taiwanese distributor, so a publisher carries no
// mal_id/mal_link at all - and a Types row naming the media types it is
// offered on (`scopes`).
//
// An admin gets the controls Person.jsx has (EntityProfileControls): Quick
// edit, my rating and the remark, PATCHed in place.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { releaseYear } from "../../lib/releaseDate";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import {
  AdminToolbar,
  RatingSelect,
  RemarkEditor,
  useEntityPatch,
} from "../../components/info/EntityProfileControls";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow, RatingStamp } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";

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
  const patch = useEntityPatch("publisher", publisher?.system_id, setPublisher);

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

  const name = publisher.display_name || "Unknown Publisher";
  const logoUrl = getCoverUrl(publisher.logo_file);
  const span = lifespan(publisher);
  const creditTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
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

      {isAdmin && <AdminToolbar ownerType="publisher" systemId={publisher.system_id} />}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN: the profile ========== */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                Publisher
              </span>
            </div>
            <div
              className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
              style={{ aspectRatio: "2/3" }}
            >
              <img
                loading="lazy"
                src={logoUrl}
                alt={`${name} logo`}
                className="w-full h-full object-cover"
                style={focusStyle(publisher.logo_focus)}
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

          {isAdmin && (
            <RatingSelect
              rating={publisher.my_rating}
              onChange={(v) => patch({ my_rating: v }, "Rating saved")}
            />
          )}

          <NamingCard type="publisher" item={publisher} />
        </div>

        {/* ========== RIGHT COLUMN: facts, then the credits ========== */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <Eyebrow className="mb-1">Publisher</Eyebrow>
            <h1 className="font-display text-4xl font-semibold text-text leading-tight">
              {name}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint mt-2">
              {creditTotal} credited entr{creditTotal === 1 ? "y" : "ies"}
            </p>
          </div>

          <InfoCard
            title="Profile"
            fields={[
              [
                { label: "Country", value: publisher.country },
                { label: "Active", value: span },
              ],
              {
                label: "Types",
                value:
                  (publisher.scopes || []).map(mediaTypeLabel).join(", ") || null,
              },
              {
                label: "Website",
                value: publisher.website_url ? (
                  <a
                    href={publisher.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline break-all"
                  >
                    {publisher.website_url}
                  </a>
                ) : null,
              },
              ...(isAdmin ? [] : [{ label: "Remark", value: publisher.remark }]),
            ]}
          />

          {isAdmin && (
            <RemarkEditor
              systemId={publisher.system_id}
              remark={publisher.remark}
              onSave={(v) => patch({ remark: v }, "Remark saved")}
            />
          )}

          {groups.length === 0 ? (
            <section className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">Empty</Eyebrow>
              <p className="text-sm text-text-muted">No credited entries</p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.media_type}>
                <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {group.label}
                  <span className="text-text-faint">{group.entries.length}</span>
                  <span className="flex-1 border-t border-dotted border-border-strong/60" />
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {group.entries.map((entry) => (
                    <CreditCard
                      key={entry.system_id}
                      entry={entry}
                      navPath={group.nav_path}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// A minimal cover-and-title card, the same one Studio.jsx draws. MediaCard is
// deliberately not reused: it reads a full media payload (status fields,
// franchise dict, admin toggles) and resolves its title through
// getDisplayName, none of which the four keys the entries endpoint returns
// can satisfy.
function CreditCard({ entry, navPath }) {
  const title = entry.display_name || "Untitled";
  const year = releaseYear(entry.release_date);
  const card = (
    <>
      <div
        className="bg-surface-2 overflow-hidden"
        style={{ aspectRatio: "2/3" }}
      >
        <img
          loading="lazy"
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
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {year || "Undated"}
        </span>
      </div>
    </>
  );

  // Series has no page of its own, so nav_path can legitimately be null;
  // such an entry is shown but not linked.
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
