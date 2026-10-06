// Frontend: page component file for Character.
//
// A character is a public entity rather than a media entry, so this page is
// hand-built beside Person.jsx and Studio.jsx instead of coming from one of
// the media detail shapes: the header is a profile, and the body is the
// entries this character is cast in, grouped as GET /api/character/{id}/entries
// returns them — by media type ONLY, because a character holds no roles (a
// person's page groups by media type AND role; see app/routers/character.py's
// get_character_entries). Each entry also names the seiyuu who voiced the
// character in that entry, since (unlike a person's own credits) knowing who
// played the part is the point of looking a character up.
//
// Like Person.jsx it reads the API with plain fetch. An admin can set my
// rating and the remark in place, and jump to the full editor; both go
// through PATCH (components/info/EntityProfileControls.jsx) and the page
// takes the response as its new state.
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

export default function Character() {
  const { publicId } = useParams();
  const [character, setCharacter] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();
  const patch = useEntityPatch("character", character?.system_id, setCharacter);

  useCanonicalPath("character", character);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. /entries still speaks UUIDs, so it has to wait for the
        // row the detail call resolves rather than run beside it.
        const characterRes = await fetch(endpoints.character.detail(publicId), {
          credentials: "include",
        });
        if (!characterRes.ok) throw new Error("Character not found.");
        const characterData = await characterRes.json();
        const entriesRes = await fetch(
          endpoints.character.entries(characterData.system_id),
          { credentials: "include" },
        );
        // The entries call is secondary: a character whose castings fail to
        // load still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setCharacter(characterData);
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
    return <MediaLoadingState isLoading loadingText="Loading character..." />;
  }

  if (error || !character) {
    return (
      <MediaLoadingState
        error={error || "Character not found."}
        errorTitle="Error Loading Character"
      />
    );
  }

  const name = character.display_name || "Unknown Character";
  // The server resolves the fallback: the chosen entry's casting photo, then
  // its cover, then the newest visible casting photo, then the newest cover.
  const photoUrl = getCoverUrl(character.display_photo_file ?? character.photo_file);
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
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {name}
        </span>
      </nav>

      {isAdmin && (
        <AdminToolbar ownerType="character" systemId={character.system_id} />
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
                Character
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
                style={focusStyle(character.display_photo_focus ?? character.photo_focus)}
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {character.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={character.my_rating} />
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <RatingSelect
              rating={character.my_rating}
              onChange={(v) => patch({ my_rating: v }, "Rating saved")}
            />
          )}

          <NamingCard type="character" item={character} />
        </div>

        {/* ========== RIGHT COLUMN: facts, then the castings ========== */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <Eyebrow className="mb-1">Character</Eyebrow>
            <h1 className="font-display text-4xl font-semibold text-text leading-tight">
              {name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
                {castingTotal} appearance{castingTotal === 1 ? "" : "s"}
              </p>
              {/* The way out to MAL, by the name rather than only in the
                  Profile card - it is where a character is looked up. */}
              <MalButton href={character.mal_link} />
            </div>
          </div>

          <InfoCard
            title="Profile"
            fields={[
              // The character's own role, not any casting's.
              [
                { label: "Role", value: character.role },
                { label: "Gender", value: character.gender },
              ],
              // Each tag list as chips, in its stored order; an empty list
              // reads "—" like every other unset row.
              { label: "Appearance", value: tagChips(character.appearance) },
              { label: "Trait", value: tagChips(character.trait) },
              {
                label: "MAL",
                value: character.mal_link ? (
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
              ...(isAdmin ? [] : [{ label: "Remark", value: character.remark }]),
            ]}
          />

          {isAdmin && (
            <RemarkEditor
              systemId={character.system_id}
              remark={character.remark}
              onSave={(v) => patch({ remark: v }, "Remark saved")}
            />
          )}

          {character.identities?.length > 0 && (
            <section>
              <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                Identities
                <span className="text-text-faint">{character.identities.length}</span>
                <span className="flex-1 border-t border-dotted border-border-strong/60" />
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {character.identities.map((identity) => (
                  <IdentityCard key={identity.system_id} identity={identity} />
                ))}
              </div>
            </section>
          )}

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
                      <CastingCard
                        key={entry.casting_id ?? entry.system_id}
                        entry={entry}
                        navPath={group.nav_path}
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
