// Frontend: info component file for SourcesCard.
//
// A slip of hairline rows: the site's icon and name on the left, an
// external-link mark on the right. Rows are ink; a brand tint appears only on
// hover. The site's own icon (lib/sourceIcons.js) is the one place its brand
// colours appear - Other and Restricted rows, being free text, have none and
// keep an empty slot so every name in a section lines up.
import { Slip } from "../ui/primitives";
import { sourceIconUrl } from "../../lib/sourceIcons";

const ROW_CLS =
  "flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-sm";
const LINK_CLS = `${ROW_CLS} text-text hover:text-brand hover:bg-brand-soft transition`;
const PLAIN_CLS = `${ROW_CLS} text-text-muted`;

function Tag({ children }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.12em] border border-border-strong text-text-muted px-1 py-0.5 leading-none shrink-0">
      {children}
    </span>
  );
}

// A fixed 16px slot, empty when the source has no icon. The white tile keeps
// the dark-on-transparent favicons (Wikipedia, FX, E-Hentai) legible in dark
// mode.
function SourceIcon({ src }) {
  if (!src) return <span className="w-4 h-4 shrink-0" aria-hidden="true" />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      data-testid="source-icon"
      className="w-4 h-4 shrink-0 rounded-sm bg-white object-contain"
      loading="lazy"
    />
  );
}

function SourceLink({ href, icon, children, title }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLS}
      title={title}
    >
      <span className="flex items-center gap-2 min-w-0">
        <SourceIcon src={icon} />
        <span className="truncate">{children}</span>
      </span>
      <i
        className="fas fa-external-link-alt text-[10px] text-text-faint shrink-0"
        aria-hidden="true"
      ></i>
    </a>
  );
}

function SourceRow({ icon, children, muted = false }) {
  return (
    <div className={`${PLAIN_CLS} ${muted ? "text-text-faint" : ""}`}>
      <span className="flex items-center gap-2 min-w-0">
        <SourceIcon src={icon} />
        <span className="truncate">{children}</span>
      </span>
    </div>
  );
}

// Media types whose sources are things you read rather than watch.
const READING_TYPES = new Set(["manga", "novel", "comic", "h-comic"]);
const PLAYING_TYPES = new Set(["game", "h-game"]);

export function accessHeading(mediaType) {
  if (PLAYING_TYPES.has(mediaType)) return "Where to Play";
  if (READING_TYPES.has(mediaType)) return "Where to Read";
  return "Where to Watch";
}

// A single `sources` row. `available` is a tristate:
//  - true + url     -> a real link
//  - true + no url  -> a plain row (known available, nothing to link to yet)
//  - false          -> a muted row marked "not available" (a known absence
//                      is information, not something to hide)
//  - null/undefined -> a muted row with no claim either way
//
// Only `main` rows are looked up for an icon: their names come from a
// vocabulary, while an other/restricted name is typed text that may merely
// resemble one.
function SourceEntry({ row }) {
  const name = <span data-testid="source-name">{row.name}</span>;
  const icon = row.bucket === "main" ? sourceIconUrl(row.name) : null;

  if (row.available === false) {
    return (
      <SourceRow icon={icon} muted>
        {name}
        <span className="ml-2 text-[10px] uppercase tracking-wide">
          (not available)
        </span>
      </SourceRow>
    );
  }

  // A URL is a link whatever the verdict says. `available` is NULL on every
  // reference row and every other/restricted row by design - only main access
  // rows carry the tristate - so gating the link on it hid every official
  // site, Twitter, AniList, wiki and free-form source.
  if (row.url) {
    return (
      <SourceLink href={row.url} icon={icon}>
        {name}
      </SourceLink>
    );
  }

  if (row.available == null) {
    return (
      <SourceRow icon={icon} muted>
        {name}
      </SourceRow>
    );
  }

  return <SourceRow icon={icon}>{name}</SourceRow>;
}

export default function SourcesCard({
  sources = [],
  mediaType,
  malLink,
  anidbLink,
  ehentaiLink,
  imdbLink,
  comicvineLink,
  openLibraryLink,
  igdbLink,
  steamLink,
  dlsiteLinkJp,
  dlsiteLinkTw,
  originalSource,
  exclusiveSource,
  serializationPlatform,
}) {
  // Never re-sort - the server already ordered these by `position`
  // (vocabulary sort_order for `main` rows, insertion order for `other`/
  // `restricted` rows).
  const accessRows = sources.filter((row) => row.kind === "access");
  const referenceRows = sources.filter((row) => row.kind === "reference");

  const tags = [originalSource, exclusiveSource, serializationPlatform].filter(
    Boolean,
  );

  // The storefront links are column-backed rather than source rows: Steam on
  // games and h-games, and an h-game's two DLsite pages.
  const hasStorefront = Boolean(steamLink || dlsiteLinkJp || dlsiteLinkTw);

  const hasAny =
    accessRows.length > 0 ||
    hasStorefront ||
    referenceRows.length > 0 ||
    Boolean(malLink) ||
    Boolean(anidbLink) ||
    Boolean(ehentaiLink) ||
    Boolean(imdbLink) ||
    Boolean(comicvineLink) ||
    Boolean(openLibraryLink) ||
    Boolean(igdbLink) ||
    tags.length > 0;

  if (!hasAny) {
    return (
      <Slip title="Sources" padded={false}>
        <div className="px-4 py-3 text-sm text-text-faint">
          No sources recorded.
        </div>
      </Slip>
    );
  }

  return (
    <Slip title="Sources" padded={false}>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      {(accessRows.length > 0 || hasStorefront) && (
        <section aria-label={accessHeading(mediaType)}>
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            {accessHeading(mediaType)}
          </div>
          {accessRows.map((row) => (
            <SourceEntry key={row.system_id} row={row} />
          ))}
          {/* A storefront, not a reference database - so it sits with the
              access rows rather than beside IGDB. It is column-backed
              (games.steam_link), so it follows the server-ordered rows
              instead of being sorted among them. */}
          {steamLink && (
            <SourceLink
              href={steamLink}
              icon={sourceIconUrl("Steam")}
            >
              Steam store page
            </SourceLink>
          )}
          {/* An h-game's DLsite pages, the same kind of thing as the Steam
              link and drawn beside it (h_game.dlsite_link_jp / _tw). */}
          {dlsiteLinkJp && (
            <SourceLink
              href={dlsiteLinkJp}
              icon={sourceIconUrl("DLsite")}
            >
              DLsite (JP)
            </SourceLink>
          )}
          {dlsiteLinkTw && (
            <SourceLink
              href={dlsiteLinkTw}
              icon={sourceIconUrl("DLsite")}
            >
              DLsite (TW)
            </SourceLink>
          )}
        </section>
      )}
      {(referenceRows.length > 0 ||
        malLink ||
        anidbLink ||
        ehentaiLink ||
        imdbLink ||
        comicvineLink ||
        openLibraryLink ||
        igdbLink) && (
        <section aria-label="Where to Look Up">
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            Where to Look Up
          </div>
          {referenceRows.map((row) => (
            <SourceEntry key={row.system_id} row={row} />
          ))}
          {malLink && (
            <SourceLink
              href={malLink}
              icon={sourceIconUrl("MyAnimeList")}
            >
              MyAnimeList
            </SourceLink>
          )}
          {anidbLink && (
            <SourceLink
              href={anidbLink}
              icon={sourceIconUrl("AniDB")}
            >
              AniDB
            </SourceLink>
          )}
          {/* An h-comic's gallery, the second fill source after MAL. */}
          {ehentaiLink && (
            <SourceLink
              href={ehentaiLink}
              icon={sourceIconUrl("E-Hentai")}
            >
              E-Hentai
            </SourceLink>
          )}
          {imdbLink && (
            <SourceLink href={imdbLink} icon={sourceIconUrl("IMDb")}>
              IMDb page
            </SourceLink>
          )}
          {comicvineLink && (
            <SourceLink
              href={comicvineLink}
              icon={sourceIconUrl("Comic Vine")}
            >
              Comic Vine
            </SourceLink>
          )}
          {openLibraryLink && (
            <SourceLink
              href={openLibraryLink}
              icon={sourceIconUrl("Open Library")}
            >
              Open Library
            </SourceLink>
          )}
          {igdbLink && (
            <SourceLink href={igdbLink} icon={sourceIconUrl("IGDB")}>
              IGDB page
            </SourceLink>
          )}
        </section>
      )}
    </Slip>
  );
}
