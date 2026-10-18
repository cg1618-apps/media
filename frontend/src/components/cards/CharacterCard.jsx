// Frontend: the grid card a character, or one of its identities, is shown
// as - one card of lib/characterCards.js. Drawn by the character library, by
// the franchise and series hubs' Characters tab, and by the search page's
// Characters tab.
import { Link } from "react-router-dom";

import { getCoverUrl, FALLBACK_SVG, focusStyle } from "../../lib/covers";
import { entityPath } from "../../lib/entityPath";
import { Chip, RatingStamp } from "../ui/primitives";

// An identity card is drawn as one: a dashed border and divider (the dashed
// line that means "identity" across the app), an outlined spine instead of
// the solid ink one, and a footer naming its character beside the
// character's face, then the dashed Identity tag. The cover stays the
// identity's own photo, with nothing laid over it.
export default function CharacterCard({ character }) {
  const name = character.display_name || "Unknown Character";
  // The server resolves the fallback (casting photos before entry covers);
  // a row from an older payload still has photo_file.
  const coverUrl = getCoverUrl(
    character.display_photo_file ?? character.photo_file,
  );
  const castingCount = character.casting_count ?? 0;
  // Empty when the row carries no public_id: there is no URL to link to, so
  // the card renders as plain markup rather than a link to nowhere.
  const isIdentity = character.card_kind === "identity";
  // An identity card carries the identity's own public_id and opens its page.
  const characterPath = entityPath(isIdentity ? "identity" : "character", character);
  const Wrapper = characterPath ? Link : "div";
  const wrapperProps = characterPath ? { to: characterPath } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`bg-surface border ${
        isIdentity ? "border-dashed border-border-strong" : "border-border"
      } hover:border-border-strong transition-colors flex flex-col group${
        characterPath ? " cursor-pointer" : ""
      }`}
      data-identity-card={isIdentity || undefined}
    >
      <div className="flex">
        <div
          className={`w-5 shrink-0 flex flex-col items-center py-1.5 overflow-hidden ${
            isIdentity
              ? "bg-surface text-text-muted border-r border-dashed border-border-strong"
              : "bg-ink text-ink-text"
          }`}
          data-card-spine
        >
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            {isIdentity ? "Identity" : "Character"}
          </span>
        </div>
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          {!isIdentity && (
            <RatingStamp
              rating={character.my_rating}
              size="sm"
              className="absolute top-1.5 right-1.5 z-10"
            />
          )}
          <img
            loading="lazy"
            src={coverUrl}
            alt="Photo"
            className="w-full h-full object-cover"
            style={focusStyle(
              character.display_photo_focus ?? character.photo_focus,
            )}
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>
      <div
        className={`p-2.5 flex flex-col gap-1.5 flex-1 border-t ${
          isIdentity ? "border-dashed border-border-strong" : "border-border"
        }`}
      >
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        {isIdentity ? (
          <>
            <span className="flex items-center gap-1.5 min-w-0">
              <img
                loading="lazy"
                src={getCoverUrl(character.character_photo_file)}
                alt=""
                className="w-[18px] h-[18px] shrink-0 rounded-full object-cover border border-border-strong"
                style={focusStyle(character.character_photo_focus)}
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
                data-character-face
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint truncate">
                {character.character_display_name}
              </span>
            </span>
            <span>
              <Chip dashed data-identity-tag>
                Identity
              </Chip>
            </span>
          </>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
            {castingCount} casting{castingCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
