// Frontend: page component file for Identity.
//
// An identity is one of a character's other identities - Edogawa Conan of
// Kudo Shinichi. It is hand-built beside Character.jsx and shaped like it, so
// the two read as the same product: a profile on the left, the facts and
// then the entries this identity is cast in on the right, grouped by media
// type as GET /api/character-identity/{id}/entries returns them. That call
// answers the same shape as the character's /entries, narrowed to the cast
// rows of this identity.
//
// An identity IS its character under another name, so the page shows what
// the character page does: the character's role, appearance and trait tags,
// rating and MAL link come from GET /api/character/{id}, read beside the
// entries; the names, photo, gender and remark are the identity's own. A
// Character section links back to the character and to its other identities.
//
// Like Character.jsx it reads the API with plain fetch. Unlike it, nothing is
// edited in place: an identity has no PATCH route, and the rating is the
// character's (set on its page), so the admin gets only the jump to the
// Modify editor, and the remark is shown to everyone.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import CastingCard from "../../components/info/CastingCard";
import IdentityCard from "../../components/info/IdentityCard";
import InfoCard from "../../components/info/InfoCard";
import MalButton from "../../components/info/MalButton";
import NamingCard from "../../components/info/NamingCard";
import { tagChips } from "../../components/info/tagChips";
import { AdminToolbar } from "../../components/info/EntityProfileControls";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow, RatingStamp } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { entityPath } from "../../lib/entityPath";

export default function Identity() {
  const { publicId } = useParams();
  const [identity, setIdentity] = useState(null);
  const [character, setCharacter] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();

  useCanonicalPath("identity", identity);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // The detail call takes the URL's public_id. The other two wait for
        // the row it resolves: the character is fetched by the
        // character_public_id it carries, /entries by its system_id.
        const identityRes = await fetch(endpoints.characterIdentity.detail(publicId), {
          credentials: "include",
        });
        if (!identityRes.ok) throw new Error("Identity not found.");
        const identityData = await identityRes.json();
        // Both secondary, and independent of each other: an identity whose
        // castings or character fail to load still has a profile worth
        // rendering, from what the identity itself carries.
        const [entriesData, characterData] = await Promise.all([
          readOptional(endpoints.characterIdentity.entries(identityData.system_id)),
          identityData.character_public_id != null
            ? readOptional(endpoints.character.detail(identityData.character_public_id))
            : null,
        ]);
        if (cancelled) return;
        setIdentity(identityData);
        setCharacter(characterData);
        setGroups(entriesData?.groups || []);
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
    return <MediaLoadingState isLoading loadingText="Loading identity..." />;
  }

  if (error || !identity) {
    return (
      <MediaLoadingState
        error={error || "Identity not found."}
        errorTitle="Error Loading Identity"
      />
    );
  }

  const name = identity.display_name || "Unknown Identity";
  const characterName = identity.character_display_name || "Unknown Character";
  // Empty when the response carries no character public_id: the name is then
  // shown as plain text rather than a link to nowhere.
  const characterPath = entityPath("character", {
    public_id: identity.character_public_id,
    display_name: identity.character_display_name,
  });
  // The character's own card in the Character section. Built from the
  // identity's fields until (or unless) the character itself loads; never
  // the character's remark, which belongs to its own page.
  const characterCard = {
    ...(character || {}),
    public_id: identity.character_public_id,
    display_name: character?.display_name || characterName,
    display_gender: character?.gender,
    remark: null,
  };
  const otherIdentities = (character?.identities || []).filter(
    (other) => other.system_id !== identity.system_id,
  );
  // The server resolves the fallback, as it does for a character's photo.
  const photoUrl = getCoverUrl(identity.display_photo_file ?? identity.photo_file);
  const castingTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/character" className="hover:text-brand transition">
          Characters
        </Link>
        <span aria-hidden="true">/</span>
        {characterPath ? (
          <Link
            to={characterPath}
            className="hover:text-brand transition truncate max-w-xs normal-case tracking-normal"
          >
            {characterName}
          </Link>
        ) : (
          <span className="truncate max-w-xs normal-case tracking-normal">
            {characterName}
          </span>
        )}
        <span aria-hidden="true">/</span>
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {name}
        </span>
      </nav>

      {isAdmin && (
        <AdminToolbar ownerType="identity" systemId={identity.system_id} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN: the profile ========== */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                Identity
              </span>
            </div>
            <div
              className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
              style={{ aspectRatio: "2/3" }}
            >
              <img
                loading="lazy"
                src={photoUrl}
                alt={`${name} photo`}
                className="w-full h-full object-cover"
                style={focusStyle(identity.display_photo_focus ?? identity.photo_focus)}
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {/* The character's rating: an identity is the same character.
                  Read-only here - it is set on the character's page. */}
              {character?.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={character.my_rating} />
                </div>
              )}
            </div>
          </div>

          <NamingCard type="identity" item={identity} />
        </div>

        {/* ========== RIGHT COLUMN: facts, then the castings ========== */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <Eyebrow className="mb-1">Identity</Eyebrow>
            <h1 className="font-display text-4xl font-semibold text-text leading-tight">
              {name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
                {castingTotal} appearance{castingTotal === 1 ? "" : "s"}
              </p>
              <MalButton href={character?.mal_link} />
            </div>
          </div>

          <div className="space-y-1.5">
            <InfoCard
              title="Profile"
              fields={[
                [
                  { label: "Role", value: character?.role },
                  // display_gender falls back to the character's when the
                  // identity sets none.
                  { label: "Gender", value: identity.display_gender },
                ],
                { label: "Appearance", value: tagChips(character?.appearance) },
                { label: "Trait", value: tagChips(character?.trait) },
                {
                  label: "MAL",
                  value: character?.mal_link ? (
                    <a
                      href={character.mal_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline break-all"
                    >
                      {character.mal_id ? `Character #${character.mal_id}` : "MyAnimeList"}
                    </a>
                  ) : null,
                },
                { label: "Remark", value: identity.remark },
              ]}
            />
            <p className="text-[10px] text-text-faint">
              Role, tags, rating and MAL are {characterName}&apos;s.
            </p>
          </div>

          <section>
            <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Character
              <span className="text-text-faint">{1 + otherIdentities.length}</span>
              <span className="flex-1 border-t border-dotted border-border-strong/60" />
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <IdentityCard identity={characterCard} to={characterPath} label="Character" />
              {otherIdentities.map((other) => (
                <IdentityCard key={other.system_id} identity={other} label="Identity" />
              ))}
            </div>
          </section>

          {groups.length === 0 ? (
            <section className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">Empty</Eyebrow>
              <p className="text-sm text-text-muted">No appearances</p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.media_type}>
                <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {mediaTypeLabel(group.media_type)}
                  <span className="text-text-faint">{group.entries.length}</span>
                  <span className="flex-1 border-t border-dotted border-border-strong/60" />
                </h2>
                {group.entries.length === 0 ? (
                  <p className="text-sm text-text-faint italic">
                    Nothing you can see here.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {group.entries.map((entry) => (
                      // Every row here is this identity, so the card's
                      // "as <identity>" line would only repeat the headline.
                      <CastingCard
                        key={entry.casting_id ?? entry.system_id}
                        entry={entry}
                        navPath={group.nav_path}
                        hideIdentity
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// A secondary read: its JSON, or null when it fails, so the page renders
// without it.
async function readOptional(url) {
  try {
    const res = await fetch(url, { credentials: "include" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
