// Frontend: info component file for SourcesCard.
//
// A slip of hairline rows: the site's icon and name on the left, an
// external-link mark on the right. Rows are ink; a brand tint appears only on
// hover. The site's own icon (lib/sourceIcons.js) is the one place its brand
// colours appear - Other and Restricted rows, being free text, have none and
// keep an empty slot so every name in a section lines up.
import { Slip } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";
import { FALLBACK_SVG } from "../../lib/covers";
import { sourceIconUrl } from "../../lib/sourceIcons";

// The one Reference Source value whose icon is the entry rather than the site:
// every work has its own official site, so no bundled favicon can stand for
// them. Matches app/utils/source_fields.py's OFFICIAL_SITE_VALUE.
const OFFICIAL_SITE = "Official site";

const ROW_CLS =
  "flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-sm";
const LINK_CLS = `${ROW_CLS} text-text hover:text-brand hover:bg-brand-soft transition`;
const PLAIN_CLS = `${ROW_CLS} text-text-muted`;

// One original / exclusive source or serialization platform. Its value comes
// from a vocabulary (Platform, Serialization Platform), so it wears its
// site's icon the way a main access row does; a value with none (Cinema,
// Other) is the bare label.
function Tag({ name }) {
  const icon = sourceIconUrl(name);
  return (
    <span
      data-testid="source-tag"
      className="inline-flex items-center gap-1 font-mono text-[9px] border border-border-strong text-text-muted px-1 py-0.5 leading-none shrink-0"
    >
      {icon && (
        <LazyImage
          src={icon}
          alt=""
          aria-hidden="true"
          data-testid="source-tag-icon"
          className="w-3 h-3 shrink-0 rounded-sm bg-white object-contain"
        />
      )}
      {name}
    </span>
  );
}

// A tag field arrives as one string, its values joined by ", "
// (app/services/domain/credits.py), so each value is split back out to be
// drawn - and given an icon - on its own.
function tagValues(...fields) {
  return [
    ...new Set(
      fields
        .filter(Boolean)
        .flatMap((field) => field.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

// A game's exclusive platform family and its Font Awesome icon - the brand
// marks for the three console makers, a computer and a phone for the rest.
const GAME_EXCLUSIVE_ICONS = {
  Nintendo: "fa-brands fa-nintendo-switch",
  PlayStation: "fa-brands fa-playstation",
  Xbox: "fa-brands fa-xbox",
  PC: "fa-solid fa-desktop",
  Mobile: "fa-solid fa-mobile-screen-button",
};

// A fixed 16px slot, empty when the source has no icon. The white tile keeps
// the dark-on-transparent favicons (Wikipedia, FX, E-Hentai) legible in dark
// mode. A cover fills the slot instead: it is a photo, not a transparent mark,
// so it is cropped to the square rather than letterboxed on white.
function SourceIcon({ src, cover = false }) {
  if (!src) return <span className="w-4 h-4 shrink-0" aria-hidden="true" />;
  const fit = cover ? "object-cover" : "bg-white object-contain";
  return (
    <LazyImage
      src={src}
      alt=""
      aria-hidden="true"
      data-testid="source-icon"
      className={`w-4 h-4 shrink-0 rounded-sm ${fit}`}

    />
  );
}

// One external link row - shared with EntityLinksCard, so an entity's links
// read exactly as an entry's sources do.
export function SourceLink({ href, icon, cover, children, title }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLS}
      title={title}
    >
      <span className="flex items-center gap-2 min-w-0">
        <SourceIcon src={icon} cover={cover} />
        <span className="truncate">{children}</span>
      </span>
      <i
        className="fas fa-external-link-alt text-[10px] text-text-faint shrink-0"
        aria-hidden="true"
      ></i>
    </a>
  );
}

function SourceRow({ icon, cover, children, muted = false }) {
  return (
    <div className={`${PLAIN_CLS} ${muted ? "text-text-faint" : ""}`}>
      <span className="flex items-center gap-2 min-w-0">
        <SourceIcon src={icon} cover={cover} />
        <span className="truncate">{children}</span>
      </span>
    </div>
  );
}

// Media types whose sources are things you read rather than watch.
const READING_TYPES = new Set(["manga", "book", "comic", "h-comic"]);
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
//
// The official site wears the entry's cover - the URL the page already shows,
// so the browser draws it from cache and nothing is stored twice. An entry
// with no cover leaves the slot empty rather than shrinking the "No Image"
// placeholder into it.
//
// `mark` names the row the entry's exclusive or original source points at -
// "Exclusive" or "Original". It is appended to the shown name only, so the
// icon is still looked up by the vocabulary value.
function SourceEntry({ row, coverUrl, mark = null }) {
  const name = (
    <span data-testid="source-name">
      {mark ? `${row.name} (${mark})` : row.name}
    </span>
  );
  const isMain = row.bucket === "main";
  const cover =
    isMain &&
    row.name === OFFICIAL_SITE &&
    Boolean(coverUrl) &&
    coverUrl !== FALLBACK_SVG;
  const icon = cover ? coverUrl : isMain ? sourceIconUrl(row.name) : null;

  if (row.available === false) {
    return (
      <SourceRow icon={icon} cover={cover} muted>
        {name}
        <span className="ml-2 text-[10px]">
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
      <SourceLink href={row.url} icon={icon} cover={cover}>
        {name}
      </SourceLink>
    );
  }

  if (row.available == null) {
    return (
      <SourceRow icon={icon} cover={cover} muted>
        {name}
      </SourceRow>
    );
  }

  return (
    <SourceRow icon={icon} cover={cover}>
      {name}
    </SourceRow>
  );
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
  originalSourceAsAccess = false,
  exclusiveSource,
  serializationPlatform,
  gameExclusive,
  coverUrl,
}) {
  // Never re-sort - the server already ordered these by `position`
  // (vocabulary sort_order for `main` rows, insertion order for `other`/
  // `restricted` rows). The exceptions are the main access rows the exclusive
  // and original sources name, which lead their section.
  const allAccessRows = sources.filter((row) => row.kind === "access");
  const referenceRows = sources.filter((row) => row.kind === "reference");

  const exclusiveName = (exclusiveSource || "").trim();
  const exclusiveRow = exclusiveName
    ? allAccessRows.find(
        (row) => row.bucket === "main" && row.name === exclusiveName,
      ) || null
    : null;
  // A TV show's or cartoon's original source (`originalSourceAsAccess`) and a
  // manga's or book's serialization platform are read the same way: each
  // value leads the section after any exclusive row, marked "(Original)" or
  // "(連載平台)". A value with a main access row marks that row; a value with
  // none - the common case for an original source, whose vocabulary is far
  // wider than the main sources - is drawn as a row of its own in the same
  // place. Each is the platform's own vocabulary value, so it wears the
  // platform's icon. An entry may name several.
  const markedEntries = [
    ...(originalSourceAsAccess ? tagValues(originalSource) : []).map((name) => ({
      name,
      mark: "Original",
    })),
    ...tagValues(serializationPlatform).map((name) => ({ name, mark: "連載平台" })),
  ].map((entry) => ({
    ...entry,
    row:
      allAccessRows.find((row) => row.bucket === "main" && row.name === entry.name) || null,
  }));
  const markedRows = new Set(markedEntries.map((o) => o.row).filter(Boolean));
  // The rest, in the server's order.
  const accessRows = allAccessRows.filter(
    (row) => row !== exclusiveRow && !markedRows.has(row),
  );
  const hasAccess = Boolean(exclusiveRow) || markedEntries.length > 0 || accessRows.length > 0;

  // A matched exclusive source is said by its row, so it is not a tag too.
  // One with no row - stored before the rule required one - stays a tag. An
  // original source or serialization platform drawn as rows is never a tag.
  const tags = tagValues(
    originalSourceAsAccess ? null : originalSource,
    exclusiveRow ? null : exclusiveSource,
  );

  // The storefront links are column-backed rather than source rows: Steam on
  // games and h-games, and an h-game's two DLsite pages.
  const hasStorefront = Boolean(steamLink || dlsiteLinkJp || dlsiteLinkTw);

  const exclusivePlatform = (gameExclusive || "").trim();

  const hasAny =
    Boolean(exclusivePlatform) ||
    hasAccess ||
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
      {/* A game's exclusive platform: a section of its own, above Where to
          Play. */}
      {exclusivePlatform && (
        <section aria-label="Exclusive Source">
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] text-text-faint">
            Exclusive Source
          </div>
          <div className={PLAIN_CLS}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-4 h-4 shrink-0 flex items-center justify-center text-text">
                {GAME_EXCLUSIVE_ICONS[exclusivePlatform] && (
                  <i className={GAME_EXCLUSIVE_ICONS[exclusivePlatform]} aria-hidden="true" />
                )}
              </span>
              <span className="truncate text-text">{exclusivePlatform}</span>
            </span>
          </div>
        </section>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
          {tags.map((tag) => (
            <Tag key={tag} name={tag} />
          ))}
        </div>
      )}
      {(hasAccess || hasStorefront) && (
        <section aria-label={accessHeading(mediaType)}>
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] text-text-faint">
            {accessHeading(mediaType)}
          </div>
          {exclusiveRow && (
            <SourceEntry row={exclusiveRow} coverUrl={coverUrl} mark="Exclusive" />
          )}
          {markedEntries.map(({ name, mark, row }) =>
            row ? (
              <SourceEntry key={`${mark}:${row.system_id}`} row={row} coverUrl={coverUrl} mark={mark} />
            ) : (
              <SourceRow key={`${mark}:${name}`} icon={sourceIconUrl(name)}>
                <span data-testid="source-name">{`${name} (${mark})`}</span>
              </SourceRow>
            ),
          )}
          {accessRows.map((row) => (
            <SourceEntry key={row.system_id} row={row} coverUrl={coverUrl} />
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
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] text-text-faint">
            Where to Look Up
          </div>
          {referenceRows.map((row) => (
            <SourceEntry key={row.system_id} row={row} coverUrl={coverUrl} />
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
