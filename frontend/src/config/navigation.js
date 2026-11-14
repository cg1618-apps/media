// Frontend: the primary navigation tree, as data.
//
// Both the desktop tab strip and the mobile drawer render from this file, so a
// nav change is a one-place edit. Nothing here knows about styling.
//
// Item shape:
//   label    text shown to the reader
//   icon     Font Awesome class
//   to       route the item links to
//   matches  extra path prefixes that also count as "inside" this item, so a
//            detail page (/anime/123) lights up the library tab it belongs to
//   dev      true for placeholders that route to /under-development
//   divider  true for a rule between item groups (admin menu only)
//   requires the permission a viewer must hold to see this one row, for the
//            admin-only pages that sit inside a tab everyone may open. A
//            list means ANY of them, the same as <ProtectedRoute
//            anyPermission> in App.jsx
//   feature  the account feature switch this row needs (hasFeature in
//            AuthContext), the same one App.jsx's <ProtectedRoute feature>
//            asks. Checked in place of `requires`, not beside it
//   gatedType the gated media type this row belongs to. The row is drawn only
//            for a session that may see that type (canSeeGatedType in
//            lib/gatedTypes.js), the same question App.jsx's route asks
//
// Sections either carry `items` (a single list) or `columns` (a mega-panel).

// The nine ordinary media types' keys. A role holding none of them reads no
// library at all - the admin, whose role holds no media_type.* - so the
// Library tab asks for any one of them. The gated three have their own
// Restricted tab.
const LIBRARY_MEDIA_TYPE_PERMISSIONS = [
  "media_type.anime",
  "media_type.anime-movie",
  "media_type.manga",
  "media_type.novel",
  "media_type.game",
  "media_type.tv-show",
  "media_type.movie",
  "media_type.cartoon",
  "media_type.comic",
];

export const NAV_SECTIONS = [
  {
    key: "library",
    label: "Library",
    requires: LIBRARY_MEDIA_TYPE_PERMISSIONS,
    columns: [
      {
        heading: "Groups",
        items: [
          {
            label: "Collection",
            icon: "fas fa-boxes-stacked",
            to: "/library/collection",
            matches: ["/collection"],
          },
          {
            label: "Franchise",
            icon: "fas fa-layer-group",
            to: "/library/franchise",
            matches: ["/franchise", "/series", "/watch-order"],
          },
        ],
      },
      {
        heading: "Entities",
        // The credited entities are a member's view of the catalogue: a guest
        // browses the media and the groups, and reads entity names as plain
        // text on those pages (useEntityHref in lib/entityPath.js). Each row
        // asks its own kind's key, as App.jsx's entity routes do; Seiyuu is a
        // person list and asks view.person.
        items: [
          {
            label: "Studio",
            icon: "fas fa-building",
            to: "/library/studio",
            matches: ["/studio"],
            requires: "view.studio",
          },
          {
            label: "Publisher",
            icon: "fas fa-copyright",
            to: "/library/publisher",
            matches: ["/publisher"],
            requires: "view.publisher",
          },
          {
            label: "Person",
            icon: "fas fa-user",
            to: "/library/person",
            matches: ["/person"],
            requires: "view.person",
          },
          {
            label: "Character",
            icon: "fas fa-masks-theater",
            to: "/library/character",
            matches: ["/character", "/identity"],
            requires: "view.character",
          },
          {
            label: "Seiyuu",
            icon: "fas fa-microphone",
            to: "/library/seiyuu",
            requires: "view.person",
          },
        ],
      },
      {
        heading: "ACG",
        items: [
          {
            label: "Anime",
            icon: "fas fa-tv",
            to: "/library/anime",
            matches: ["/anime"],
          },
          {
            label: "Anime Movie",
            icon: "fas fa-film",
            to: "/library/anime-movie",
            matches: ["/anime-movie"],
          },
          {
            label: "Manga",
            icon: "fas fa-book",
            to: "/library/manga",
            matches: ["/manga"],
          },
          {
            label: "Novel",
            icon: "fas fa-book-open",
            to: "/library/novel",
            matches: ["/novel"],
          },
          {
            label: "Game",
            icon: "fas fa-gamepad",
            to: "/library/game",
            matches: ["/game"],
          },
        ],
      },
      {
        heading: "Reality",
        items: [
          {
            label: "TV Show",
            icon: "fas fa-video",
            to: "/library/tv-show",
            matches: ["/tv-show"],
          },
          {
            label: "Movie",
            icon: "fas fa-ticket-alt",
            to: "/library/movie",
            matches: ["/movie"],
          },
          {
            label: "Cartoon",
            icon: "fas fa-laugh-squint",
            to: "/library/cartoon",
            matches: ["/cartoon"],
          },
          {
            label: "Comic",
            icon: "fas fa-book-open",
            to: "/library/comic",
            matches: ["/comic"],
          },
        ],
      },
    ],
  },
  {
    key: "restricted",
    label: "Restricted",
    // The gated media types, apart from the library everyone browses. Every
    // row carries a `gatedType`, so a session that may see none of them is
    // left with an empty section and visibleSections drops the tab.
    items: [
      // Only a session whose mode carries the h-comic label is told the type
      // exists. App.jsx's <ProtectedRoute gatedType> asks the same question
      // for both of its routes.
      {
        label: "H-Comic",
        icon: "fas fa-book",
        to: "/library/h-comic",
        matches: ["/h-comic"],
        gatedType: "h-comic",
      },
      // Gated on h-game the same way.
      {
        label: "H-Game",
        icon: "fas fa-gamepad",
        to: "/library/h-game",
        matches: ["/h-game"],
        gatedType: "h-game",
      },
      // Gated on hentai the same way. Anime's icon, as H-Comic takes manga's
      // and H-Game game's.
      {
        label: "Hentai",
        icon: "fas fa-tv",
        to: "/library/hentai",
        matches: ["/hentai"],
        gatedType: "hentai",
      },
    ],
  },
  {
    key: "track",
    label: "Track",
    // The account's own progress: what it plans to watch and what it has
    // finished.
    items: [
      // Plan is a per-user page: its API answers 401 to a stranger and its
      // route redirects to login (App.jsx, ProtectedRoute requireAuth), so
      // showing the row logged out would only bounce people. self.list is the
      // nav's spelling of "a signed-in member with a library of their own" -
      // user and super hold it; guest and admin do not, since neither role
      // holds any self.* key. Settings, in the account strip, is gated the
      // same way.
      { label: "Plan", icon: "fas fa-clipboard-list", to: "/plan", requires: "self.list" },
      // Completions is an extra a member gets on top of browsing:
      // view.extras, the same key App.jsx's route asks.
      {
        label: "Completions",
        icon: "fas fa-history",
        to: "/completions",
        requires: "view.extras",
      },
    ],
  },
  {
    key: "explore",
    label: "Explore",
    // The browsing pages: ways into the collection by season, by release
    // date, by chance and by the numbers.
    items: [
      // Seasonal and Statistics are per-user like Plan, and gated on
      // self.list for the same reason: Statistics is built from the caller's
      // own seasonal rows.
      { label: "Seasonal", icon: "fas fa-leaf", to: "/seasonal", requires: "self.list" },
      // Future Releases is an extra (view.extras); the Random Picker asks its
      // own key, view.random_picker - super, user and shared, never guest.
      // Each is the key App.jsx's routes ask. /random/<type> lights the
      // Random Picker row up too.
      {
        label: "Future Releases",
        icon: "fas fa-calendar-plus",
        to: "/future-releases",
        requires: "view.extras",
      },
      {
        label: "Random Picker",
        icon: "fas fa-dice",
        to: "/random",
        requires: "view.random_picker",
      },
      { label: "Statistics", icon: "fas fa-chart-bar", to: "/statistics", requires: "self.list" },
    ],
  },
  {
    key: "extras",
    label: "Extras",
    // Quotes, memes and resources, then the catalogue editors' relations and
    // watch orders.
    items: [
      // Quotes and Memes follow the account's quotes_memes feature switch,
      // the one App.jsx's routes ask. Both are read-only for a member; their
      // edit controls ask manage.catalog inside the page. Resources is the
      // admin's and super's alone - manage.resources, the key App.jsx's route
      // and /api/resources ask, for reading as well as editing.
      { label: "Quotes", icon: "fas fa-quote-left", to: "/quote", feature: "quotes_memes" },
      { label: "Memes", icon: "fas fa-face-grin-squint", to: "/meme", feature: "quotes_memes" },
      {
        label: "Resources",
        icon: "fas fa-bookmark",
        to: "/resources",
        requires: "manage.resources",
      },
      // Relations and Watch Orders are ways of reading the collection, so they
      // belong here rather than in Admin — but both pages write through
      // catalogue endpoints (mediaRelation/watchOrder + resource CRUD), so the
      // rows (and the rule above them) ask for manage.catalog, same as Entry.
      { divider: true, requires: "manage.catalog" },
      {
        label: "Relations",
        icon: "fas fa-diagram-project",
        to: "/relations",
        requires: "manage.catalog",
      },
      {
        label: "Watch Orders",
        icon: "fas fa-list-ol",
        to: "/watch-orders",
        requires: "manage.catalog",
      },
    ],
  },
  // The account's own settings are not a section row: they sit with the
  // account in Nav.jsx's strip, beside Requests and log out.
  {
    key: "entry",
    label: "Entry",
    // Add/Modify/Delete/Form Defaults all write catalogue rows through
    // catalogue CRUD endpoints (resource(...).create/update/remove, etc.);
    // Picker Defaults writes /api/random-picker-defaults, also manage.catalog.
    // Images is the image library, manage.images - held by the admin, who
    // holds no manage.catalog, so the tab asks for either and each row for
    // its own.
    requires: ["manage.catalog", "manage.images"],
    items: [
      { label: "Add Entry", icon: "fas fa-plus-circle", to: "/add", requires: "manage.catalog" },
      { label: "Modify Entry", icon: "fas fa-edit", to: "/modify", requires: "manage.catalog" },
      {
        label: "Delete Entry",
        icon: "fas fa-trash-alt",
        to: "/delete",
        requires: "manage.catalog",
      },
      {
        label: "Form Defaults",
        icon: "fas fa-sliders-h",
        to: "/defaults",
        requires: "manage.catalog",
      },
      {
        label: "Picker Defaults",
        icon: "fas fa-dice",
        to: "/random-defaults",
        requires: "manage.catalog",
      },
      { label: "Images", icon: "fas fa-images", to: "/images", requires: "manage.images" },
    ],
  },
  {
    key: "note",
    label: "Note",
    // Each row asks its own key, so the tab asks for any of them: the admin
    // holds manage.options, admin.authz and manage.pipelines but not
    // manage.catalog, and still sees the whole section.
    requires: ["manage.options", "admin.authz", "manage.catalog", "manage.pipelines"],
    // The three read-only inventories of how the data is described: the
    // vocabulary, its translations, and which columns each external API
    // writes. Editing lives on Add/Modify under Entry. manage.options, the
    // key App.jsx's routes, /api/options and /api/constants/external-apis ask.
    items: [
      {
        label: "System Options",
        icon: "fas fa-list-check",
        to: "/options",
        requires: "manage.options",
      },
      {
        label: "Alias Conversion",
        icon: "fas fa-right-left",
        to: "/aliases",
        requires: "manage.options",
      },
      {
        label: "External APIs",
        icon: "fas fa-cloud-arrow-down",
        to: "/external-apis",
        requires: "manage.options",
      },
      // The label reference: every content label, which modes show it and
      // how many entries and franchises carry it. Read by super, who attaches
      // the labels, and by the admin, to see what a mode restriction does -
      // so it sits here, where both see it, rather than in Admin, which super
      // never opens. The row asks the same either-of App.jsx's route asks.
      {
        label: "Content Labels",
        icon: "fas fa-tags",
        to: "/content-labels",
        requires: ["admin.authz", "manage.catalog"],
      },
      // What the pipelines change, step by step. It explains the Control
      // Center's actions, so it takes their gate: super and admin hold
      // manage.pipelines, and nobody else.
      // App.jsx's /business-logic route asks the same.
      {
        label: "Business Logic",
        icon: "fas fa-gears",
        to: "/business-logic",
        requires: "manage.pipelines",
      },
    ],
  },
  {
    key: "system",
    label: "System",
    // Control Center, Data History and Review Queue call only
    // /api/system/* and /api/data-control/*, which require manage.pipelines
    // — not the same capability as the catalogue CRUD pages above, and not
    // the accounts/roles/labels pages below, so this is its own tab.
    requires: "manage.pipelines",
    items: [
      { label: "Control Center", icon: "fas fa-cog", to: "/system" },
      { label: "Data History", icon: "fas fa-history", to: "/data-history" },
      { label: "Review Queue", icon: "fas fa-tasks", to: "/review-queue" },
      { label: "Clean Orphans", icon: "fas fa-broom", to: "/clean-orphans" },
      // The request inbox asks its own permission rather than the section's:
      // App.jsx's /request-inbox route gates on manage.requests. Super and
      // the admin hold both today, so the row shows wherever the tab does.
      {
        label: "Inbox",
        icon: "fas fa-inbox",
        to: "/request-inbox",
        requires: "manage.requests",
      },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    // Users, Roles and Access Modes are the accounts/authz surface —
    // admin.authz, not manage.catalog or manage.pipelines. `adminOnly` is
    // still read as a legacy synonym for requires: "admin.authz".
    requires: "admin.authz",
    items: [
      { label: "Users", icon: "fas fa-users", to: "/users" },
      { label: "Roles", icon: "fas fa-user-shield", to: "/roles" },
      // No `requires` of its own: the section already declares admin.authz
      // and the link inherits it. Declaring it again would be a second place
      // to keep in step with App.jsx's route gate.
      {
        label: "Access Modes",
        icon: "fas fa-eye-slash",
        to: "/access-modes",
      },
    ],
  },
];

// Every link in a section, whether it came from `items` or from `columns`.
export function sectionItems(section) {
  return section.columns
    ? section.columns.flatMap((c) => c.items)
    : (section.items ?? []);
}

// A prefix owns a path when it is the path itself or a parent segment of it.
// Segment-aware so "/library/anime" does not claim "/library/anime-movie".
function ownsPath(prefix, pathname) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Which item the current route sits under, or null when the route belongs to
// no section (home, login, search).
export function activeItem(pathname, sections = NAV_SECTIONS) {
  for (const section of sections) {
    for (const item of sectionItems(section)) {
      const prefixes = [item.to, ...(item.matches || [])].filter(Boolean);
      if (prefixes.some((p) => ownsPath(p, pathname))) return { section, item };
    }
  }
  return null;
}

// The tab to mark as current, or null on routes that own no tab.
export function activeSectionKey(pathname, sections = NAV_SECTIONS) {
  return activeItem(pathname, sections)?.section.key ?? null;
}

// The permission a section needs, or null when anyone may see it.
// `adminOnly: true` is the old spelling of requires: "admin.authz" — nothing
// in NAV_SECTIONS still uses it, but a caller with an older config object
// gets the accounts/roles/labels capability, the closest surviving match to
// what the deleted bare "admin" permission used to gate exclusively.
export function sectionRequirement(section) {
  return section.requires ?? (section.adminOnly ? "admin.authz" : null);
}

// The permission a single row needs, or null when anyone may see it. A list
// is any-of.
export function itemRequirement(item) {
  return item.requires ?? (item.adminOnly ? "admin.authz" : null);
}

// Whether a viewer meets a requirement: one permission, or any of a list.
export function meets(has, needed) {
  if (!needed) return true;
  return Array.isArray(needed) ? needed.some((p) => has(p)) : has(needed);
}

// Nobody is shown a gated row unless the caller says they may see it.
const SEES_NO_GATED_TYPE = () => false;
// Nor a feature row unless the caller says the account holds the feature.
const HOLDS_NO_FEATURE = () => false;

// The rows of one list a viewer may see. `canSeeType(type)` answers for rows
// carrying a `gatedType`, and `hasFeature(name)` for rows carrying a
// `feature`; left out, every such row is hidden.
export function visibleItems(
  items,
  has,
  canSeeType = SEES_NO_GATED_TYPE,
  hasFeature = HOLDS_NO_FEATURE,
) {
  return items.filter((item) => {
    if (item.gatedType && !canSeeType(item.gatedType)) return false;
    if (item.feature) return hasFeature(item.feature);
    return meets(has, itemRequirement(item));
  });
}

// The same section with the rows this viewer may not see removed. Returns the
// section itself when nothing was dropped, and always hands back the original
// item objects — Nav marks the current row by identity.
function withVisibleItems(section, has, canSeeType, hasFeature) {
  if (section.columns) {
    const columns = section.columns
      .map((col) => ({
        ...col,
        items: visibleItems(col.items, has, canSeeType, hasFeature),
      }))
      .filter((col) => col.items.length > 0);
    const kept = columns.reduce((n, col) => n + col.items.length, 0);
    return kept === sectionItems(section).length
      ? section
      : { ...section, columns };
  }
  if (!section.items) return section;
  const items = visibleItems(section.items, has, canSeeType, hasFeature);
  return items.length === section.items.length ? section : { ...section, items };
}

// The sections a viewer may see, each trimmed to the rows they may see. A
// section left with nothing but dividers is dropped along with them.
// `canSeeType` and `hasFeature` are the gated-type and feature questions
// (see visibleItems).
export function visibleSections(
  sections,
  has,
  canSeeType = SEES_NO_GATED_TYPE,
  hasFeature = HOLDS_NO_FEATURE,
) {
  return sections
    .filter((section) => meets(has, sectionRequirement(section)))
    .map((section) => withVisibleItems(section, has, canSeeType, hasFeature))
    .filter(
      (section) =>
        !(section.items || section.columns) ||
        sectionItems(section).some((item) => !item.divider),
    );
}
