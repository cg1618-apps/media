import { describe, expect, it } from "vitest";

import {
  NAV_SECTIONS,
  activeItem,
  activeSectionKey,
  itemRequirement,
  meets,
  sectionItems,
  sectionRequirement,
  visibleSections,
} from "./navigation";

// The nine ordinary media types: the whole of the guest role
// (default_guest_permissions in app/services/rbac/seed.py), and part of every
// member's. The Library tab asks for any one of them.
const MEDIA_TYPE_KEYS = [
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
const GUEST = new Set(MEDIA_TYPE_KEYS);
const holdsGuest = (p) => GUEST.has(p);

// The admin role's fixed set (ADMIN_FIXED_PERMISSIONS in
// app/services/rbac/permissions.py): its own pages, and no catalogue key.
const ADMIN = new Set([
  "admin.authz",
  "manage.pipelines",
  "manage.requests",
  "manage.announcements",
  "manage.options",
  "manage.images",
  "manage.resources",
]);
const holdsAdmin = (p) => ADMIN.has(p);

// A user's keys as seeded (default_user_permissions): the guest's, the
// non-entity view.* keys and its own rows. No manage.* at all.
const USER = new Set([
  ...MEDIA_TYPE_KEYS,
  "view.search",
  "view.extras",
  "view.personal",
  "self.list",
  "self.personal_notes",
  "self.requests",
  "self.password",
]);
const holdsUser = (p) => USER.has(p);

// The section a route's item sits in, by key.
function ownersOf(to) {
  return NAV_SECTIONS.filter((s) =>
    sectionItems(s).some((i) => i.to === to),
  ).map((s) => s.key);
}

describe("activeSectionKey", () => {
  it("lights up the tab a library page belongs to", () => {
    expect(activeSectionKey("/library/anime")).toBe("library");
    expect(activeSectionKey("/plan")).toBe("track");
    expect(activeSectionKey("/statistics")).toBe("insights");
    expect(activeSectionKey("/add")).toBe("entry");
  });

  it("lights up the library tab from a media detail page", () => {
    expect(activeSectionKey("/anime/1234")).toBe("library");
    expect(activeSectionKey("/franchise/77")).toBe("library");
    expect(activeSectionKey("/series/77")).toBe("library");
    expect(activeSectionKey("/watch-order/77")).toBe("library");
  });

  it("does not let one library prefix claim another", () => {
    // "/library/anime" must not swallow "/library/anime-movie", and
    // "/anime/12" must not be read as an anime-movie detail page.
    expect(activeItem("/library/anime-movie").item.label).toBe("Anime Movie");
    expect(activeItem("/anime-movie/12").item.label).toBe("Anime Movie");
    expect(activeItem("/anime/12").item.label).toBe("Anime");
  });

  it("lights up Character on a character page and on an identity page", () => {
    expect(activeItem("/character/7/kudo-shinichi").item.label).toBe("Character");
    expect(activeItem("/identity/3/edogawa-conan").item.label).toBe("Character");
  });

  it("keeps seasonal detail pages under Track", () => {
    expect(activeSectionKey("/seasonal")).toBe("track");
    expect(activeSectionKey("/seasonal/2024-Spring")).toBe("track");
  });

  it("returns null on routes that own no tab", () => {
    expect(activeSectionKey("/")).toBeNull();
    expect(activeSectionKey("/login")).toBeNull();
    expect(activeSectionKey("/search")).toBeNull();
  });
});

describe("NAV_SECTIONS", () => {
  it("groups Collection and Franchise apart from ACG and Reality", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const groups = library.columns.find((c) => c.heading === "Groups");
    expect(groups.items.map((i) => i.label)).toEqual([
      "Collection",
      "Franchise",
    ]);
  });

  it("keeps the credited entities in their own column, not Groups", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const entities = library.columns.find((c) => c.heading === "Entities");
    expect(entities.items.map((i) => i.label)).toEqual([
      "Studio",
      "Publisher",
      "Person",
      "Character",
      "Seiyuu",
    ]);
  });

  it("lists Seiyuu with the entities, not under ACG", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const acg = library.columns.find((c) => c.heading === "ACG");
    expect(acg.items.map((i) => i.label)).not.toContain("Seiyuu");
    expect(activeItem("/library/seiyuu").item.label).toBe("Seiyuu");
  });

  it("lists Game in the ACG column - ACG is anime, comic and games", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const acg = library.columns.find((c) => c.heading === "ACG");
    expect(acg.items.map((i) => i.label)).toContain("Game");
    expect(activeItem("/library/game").item.label).toBe("Game");
    expect(activeItem("/game/12").item.label).toBe("Game");
  });

  it("gathers the entry forms and the image library under their own Entry tab", () => {
    const entry = NAV_SECTIONS.find((s) => s.key === "entry");
    expect(sectionItems(entry).map((i) => i.to)).toEqual([
      "/add",
      "/modify",
      "/delete",
      "/defaults",
      "/random-defaults",
      "/images",
    ]);
  });

  it("gathers the read-only inventories under a Note tab", () => {
    // System Options, its alias translations, and which columns each external
    // API writes: three read-only views over how the data is described. The
    // label reference is the fourth, over what restricts it.
    const note = NAV_SECTIONS.find((s) => s.key === "note");
    expect(sectionItems(note).map((i) => i.to)).toEqual([
      "/options",
      "/aliases",
      "/external-apis",
      "/content-labels",
      "/business-logic",
    ]);
    expect(activeSectionKey("/external-apis")).toBe("note");
    expect(activeSectionKey("/business-logic")).toBe("note");
  });

  it("reads Relations and Watch Orders as Insights, gated on manage.catalog", () => {
    // They belong with the other ways of looking at the collection, but both
    // write through catalogue endpoints, so they stay gated inside a tab
    // everyone can open.
    expect(ownersOf("/relations")).toEqual(["insights"]);
    expect(ownersOf("/watch-orders")).toEqual(["insights"]);

    const insights = NAV_SECTIONS.find((s) => s.key === "insights");
    const gated = sectionItems(insights)
      .filter((i) => !i.divider && itemRequirement(i) === "manage.catalog")
      .map((i) => i.to);
    expect(gated).toEqual(["/relations", "/watch-orders"]);
    expect(itemRequirement({ to: "/statistics" })).toBeNull();
  });

  it("lists Resources in Insights right after Memes, on manage.resources", () => {
    // Resources is the admin's and super's alone (manage.resources, reads and
    // writes); Quotes and Memes beside it follow the account's quotes_memes
    // feature switch instead.
    expect(ownersOf("/resources")).toEqual(["insights"]);
    const insights = NAV_SECTIONS.find((s) => s.key === "insights");
    const items = sectionItems(insights);
    const tos = items.map((i) => i.to);
    expect(tos.indexOf("/resources")).toBe(tos.indexOf("/meme") + 1);
    const row = (to) => items.find((i) => i.to === to);
    expect(itemRequirement(row("/resources"))).toBe("manage.resources");
    expect(row("/quote").feature).toBe("quotes_memes");
    expect(row("/meme").feature).toBe("quotes_memes");
  });

  it("splits the pipeline pages from the accounts/authz pages", () => {
    // Control Center, Data History, Review Queue and Clean Orphans call only
    // /api/system/* and /api/data-control/*  (manage.pipelines); Users,
    // Roles and Access Modes are the accounts/authz surface
    // (admin.authz) — not the same capability, so not the same tab.
    //
    // Clean Orphans sits here rather than under admin because it is gated by
    // manage.pipelines like the rest of /api/data-control. It deletes, which
    // reads as an admin power, but the capability that authorises it is the
    // pipeline one - and this list is the second of the SPA's two independent
    // permission surfaces, so it has to agree with App.jsx rather than with
    // intuition about severity.
    //
    // Access Modes sits under admin for the same kind of reason read the
    // other way: it decides which entries and fields a session can reach, so
    // it is the authz surface (admin.authz), not a pipeline.
    const pipelines = NAV_SECTIONS.find((s) => s.key === "pipelines");
    expect(sectionItems(pipelines).map((i) => i.to)).toEqual([
      "/system",
      "/data-history",
      "/review-queue",
      "/clean-orphans",
      "/request-inbox",
    ]);
    expect(sectionRequirement(pipelines)).toBe("manage.pipelines");

    const admin = NAV_SECTIONS.find((s) => s.key === "admin");
    expect(sectionItems(admin).map((i) => i.to)).toEqual([
      "/users",
      "/roles",
      "/access-modes",
    ]);
    expect(sectionRequirement(admin)).toBe("admin.authz");
    // No item here declares its own requirement: they inherit the section's.
    // A second declaration would be a second place to keep in step with
    // App.jsx's route gates, and the two surfaces already disagree elsewhere.
    expect(
      sectionItems(admin).every((i) => i.requires === undefined),
    ).toBe(true);
  });

  it("lists the request inbox under Pipelines, gated on manage.requests", () => {
    // Its own key, not the section's: App.jsx's /request-inbox route asks
    // manage.requests. A viewer holding the pipelines but not the inbox is
    // what makes the row's own gate bite - and the mirror proves the section
    // was drawn with the row in it.
    const holdsPipelines = (p) => p === "manage.pipelines";
    const without = visibleSections(NAV_SECTIONS, holdsPipelines).find(
      (s) => s.key === "pipelines",
    );
    expect(sectionItems(without).map((i) => i.to)).toContain("/system");
    expect(sectionItems(without).map((i) => i.to)).not.toContain("/request-inbox");

    const holdsBoth = (p) => p === "manage.pipelines" || p === "manage.requests";
    const withInbox = visibleSections(NAV_SECTIONS, holdsBoth).find(
      (s) => s.key === "pipelines",
    );
    expect(sectionItems(withInbox).map((i) => i.to)).toContain("/request-inbox");
  });

  it("gates Entry and Note on any of the keys their rows ask", () => {
    // The admin holds manage.images and manage.options but not
    // manage.catalog, so a tab gated on manage.catalog alone would hide
    // pages the admin may open. Each row asks its own key.
    const entry = NAV_SECTIONS.find((s) => s.key === "entry");
    const note = NAV_SECTIONS.find((s) => s.key === "note");
    expect(sectionRequirement(entry)).toEqual(["manage.catalog", "manage.images"]);
    expect(sectionRequirement(note)).toEqual([
      "manage.options",
      "admin.authz",
      "manage.catalog",
      "manage.pipelines",
    ]);
    const row = (section, to) => sectionItems(section).find((i) => i.to === to);
    for (const to of ["/add", "/modify", "/delete", "/defaults", "/random-defaults"]) {
      expect(itemRequirement(row(entry, to)), to).toBe("manage.catalog");
    }
    expect(itemRequirement(row(entry, "/images"))).toBe("manage.images");
    for (const to of ["/options", "/aliases", "/external-apis"]) {
      expect(itemRequirement(row(note, to)), to).toBe("manage.options");
    }
  });

  it("lists the label reference once, under Note, for admin and super alike", () => {
    // Super holds manage.catalog and never opens Admin; the admin holds
    // admin.authz. One row in a section both see, so neither is sent to look
    // for it and the admin is not shown it twice.
    expect(ownersOf("/content-labels")).toEqual(["note"]);
    const note = NAV_SECTIONS.find((s) => s.key === "note");
    const item = sectionItems(note).find((i) => i.to === "/content-labels");
    expect(itemRequirement(item)).toEqual([
      "admin.authz",
      "manage.catalog",
    ]);

    const routesFor = (has) =>
      visibleSections(NAV_SECTIONS, has).flatMap((s) =>
        sectionItems(s).map((i) => i.to),
      );
    const holdsCatalog = (p) => p === "manage.catalog";
    const holdsPipelines = (p) => p === "manage.pipelines";
    expect(routesFor(holdsCatalog)).toContain("/content-labels");
    expect(routesFor(() => true)).toContain("/content-labels");
    // The mirror: a viewer holding an unrelated permission does not see it.
    expect(routesFor(holdsPipelines)).not.toContain("/content-labels");
  });
});

describe("meets", () => {
  const holdsCatalog = (p) => p === "manage.catalog";

  it("passes when there is no requirement", () => {
    expect(meets(() => false, null)).toBe(true);
  });

  it("asks one permission when given a string", () => {
    expect(meets(holdsCatalog, "manage.catalog")).toBe(true);
    expect(meets(holdsCatalog, "admin.authz")).toBe(false);
  });

  it("passes a list when any one of it is held, and refuses when none is", () => {
    expect(meets(holdsCatalog, ["admin.authz", "manage.catalog"])).toBe(true);
    expect(meets(holdsCatalog, ["admin.authz", "manage.pipelines"])).toBe(false);
  });
});

describe("visibleSections", () => {
  const holdsNothing = () => false;
  const holdsEverything = () => true;

  it("hides a section whose permission the viewer lacks", () => {
    const keys = visibleSections(NAV_SECTIONS, holdsNothing).map((s) => s.key);
    expect(keys).not.toContain("admin");
  });

  it("shows it once the viewer holds the permission", () => {
    const keys = visibleSections(NAV_SECTIONS, holdsEverything).map(
      (s) => s.key,
    );
    expect(keys).toContain("admin");
  });

  it("drops the admin-only rows from a section a member may open", () => {
    // manage.resources opens Insights (Resources); the insights section being
    // drawn at all is what lets the manage.catalog rows be dropped by their
    // own gate.
    const holdsResources = (p) => p === "manage.resources";
    const [insights] = visibleSections(NAV_SECTIONS, holdsResources).filter(
      (s) => s.key === "insights",
    );
    const routes = sectionItems(insights).map((i) => i.to);
    expect(routes).toContain("/resources");
    expect(routes).not.toContain("/relations");
    expect(routes).not.toContain("/watch-orders");
  });

  it("shows Quotes and Memes only to an account with the feature switch", () => {
    // self.list is held in both cases - it draws Insights (Statistics) - so
    // the switch is what decides.
    const holdsSelfList = (p) => p === "self.list";
    const routesFor = (hasFeature) =>
      visibleSections(NAV_SECTIONS, holdsSelfList, undefined, hasFeature).flatMap(
        (s) => sectionItems(s).map((i) => i.to),
      );
    const without = routesFor(() => false);
    expect(without).toContain("/statistics");
    expect(without).not.toContain("/quote");
    expect(without).not.toContain("/meme");
    // Mirror: the same viewer with the switch on.
    const withIt = routesFor((f) => f === "quotes_memes");
    expect(withIt).toContain("/quote");
    expect(withIt).toContain("/meme");
  });

  it("hides the per-user rows from a logged-out visitor", () => {
    // Plan, Seasonal and Statistics are per-user pages: their APIs answer 401
    // and their routes redirect to login, so the rows would only bounce a
    // guest. self.list is the nav's spelling of "a signed-in member".
    const holdsSelfList = (p) => p === "self.list";
    const routesFor = (has) =>
      visibleSections(NAV_SECTIONS, has).flatMap((s) =>
        sectionItems(s).map((i) => i.to),
      );

    const forGuest = routesFor(holdsNothing);
    expect(forGuest).not.toContain("/plan");
    expect(forGuest).not.toContain("/seasonal");
    expect(forGuest).not.toContain("/statistics");

    const forMember = routesFor(holdsSelfList);
    expect(forMember).toContain("/plan");
    expect(forMember).toContain("/seasonal");
    expect(forMember).toContain("/statistics");
  });

  it("shows Settings to a member holding self.list and to nobody else", () => {
    // The one row a signed-in non-admin has of their own, which is why it is
    // an item-level requirement inside a section a guest may open rather than
    // a row in the wholly admin-gated Admin section.
    const holdsSelfList = (p) => p === "self.list";

    const forGuest = visibleSections(NAV_SECTIONS, holdsNothing)
      .filter((s) => s.key === "insights")
      .flatMap((s) => sectionItems(s).map((i) => i.to));
    expect(forGuest).not.toContain("/settings");

    const forMember = visibleSections(NAV_SECTIONS, holdsSelfList)
      .filter((s) => s.key === "insights")
      .flatMap((s) => sectionItems(s).map((i) => i.to));
    expect(forMember).toContain("/settings");
    // A member is still not an admin.
    expect(forMember).not.toContain("/watch-orders");
  });

  it("keeps them for an admin, and keeps item identity intact", () => {
    const [insights] = visibleSections(
      NAV_SECTIONS,
      holdsEverything,
      undefined,
      holdsEverything,
    ).filter((s) => s.key === "insights");
    // Nav marks the current row by object identity, so filtering must hand
    // back the very same item objects, not copies.
    expect(sectionItems(insights)).toEqual(
      sectionItems(NAV_SECTIONS.find((s) => s.key === "insights")),
    );
    expect(activeItem("/watch-orders").item).toBe(
      sectionItems(insights).find((i) => i.to === "/watch-orders"),
    );
  });

  it("hides a section whose every row the viewer lacks", () => {
    const sections = [
      {
        key: "secret",
        label: "Secret",
        items: [{ label: "Hidden", to: "/hidden", requires: "admin" }],
      },
    ];
    expect(visibleSections(sections, holdsNothing)).toEqual([]);
    expect(visibleSections(sections, holdsEverything)).toEqual(sections);
  });

  it("shows Library to a holder of any ordinary media type, and to nobody else", () => {
    // The admin holds a non-empty set with no media_type.* in it, so the
    // refusal is the gate's doing; the guest's nine keys are the mirror, and
    // any one of them alone is enough.
    const keysFor = (has) => visibleSections(NAV_SECTIONS, has).map((s) => s.key);
    expect(keysFor(holdsAdmin)).not.toContain("library");
    expect(keysFor(holdsNothing)).not.toContain("library");
    expect(keysFor(holdsGuest)).toContain("library");
    expect(keysFor((p) => p === "media_type.comic")).toContain("library");
  });

  it("still understands the older adminOnly spelling", () => {
    const legacy = [{ key: "legacy", label: "Legacy", adminOnly: true }];
    expect(sectionRequirement(legacy[0])).toBe("admin.authz");
    expect(visibleSections(legacy, holdsNothing)).toEqual([]);
    expect(visibleSections(legacy, holdsEverything)).toEqual(legacy);
  });

  it("shows Business Logic to a viewer holding manage.pipelines", () => {
    const holdsCatalogAndPipelines = (p) =>
      p === "manage.catalog" || p === "manage.pipelines";
    const note = visibleSections(NAV_SECTIONS, holdsCatalogAndPipelines).find(
      (s) => s.key === "note",
    );
    expect(sectionItems(note).map((i) => i.to)).toContain("/business-logic");
  });

  it("hides Business Logic from a catalogue editor without manage.pipelines", () => {
    // manage.catalog is what makes this bite: it opens the Note section, so
    // the row is dropped by its own gate and not by the section's. The
    // section's other rows staying visible proves the section was drawn.
    const holdsCatalog = (p) => p === "manage.catalog";
    const note = visibleSections(NAV_SECTIONS, holdsCatalog).find(
      (s) => s.key === "note",
    );
    expect(note).toBeDefined();
    const routes = sectionItems(note).map((i) => i.to);
    expect(routes).toContain("/content-labels");
    expect(routes).not.toContain("/business-logic");
  });

  it("asks for the exact permission the section names", () => {
    const asked = [];
    visibleSections(NAV_SECTIONS, (p) => {
      asked.push(p);
      return true;
    });
    expect(asked).toContain("admin.authz");
    expect(asked).toContain("manage.catalog");
    expect(asked).toContain("manage.pipelines");
  });
});

describe("visibleSections - the guest scope", () => {
  // A guest holds the nine ordinary media types and no view.* key. What it
  // keeps is the Library tab's Groups and media-type columns; everything
  // else is a member's.
  const holdsNothing = holdsGuest;
  const MEMBER = new Set([
    ...MEDIA_TYPE_KEYS,
    "self.list",
    "view.studio",
    "view.publisher",
    "view.person",
    "view.character",
    "view.search",
    "view.extras",
    "view.personal",
  ]);
  const holdsMember = (p) => MEMBER.has(p);
  const routesFor = (has, hasFeature) =>
    visibleSections(NAV_SECTIONS, has, undefined, hasFeature).flatMap((s) =>
      sectionItems(s).map((i) => i.to),
    );
  // Quotes and Memes follow the account's switch, which a guest never has.
  const memberFeatures = (f) => f === "quotes_memes";

  it("leaves a guest only the Library tab", () => {
    expect(visibleSections(NAV_SECTIONS, holdsNothing).map((s) => s.key)).toEqual([
      "library",
    ]);
  });

  it("keeps Groups and the media types, drops the Entities column", () => {
    const [library] = visibleSections(NAV_SECTIONS, holdsNothing);
    expect(library.columns.map((c) => c.heading)).toEqual([
      "Groups",
      "ACG",
      "Reality",
    ]);
    const forMember = visibleSections(NAV_SECTIONS, holdsMember).find(
      (s) => s.key === "library",
    );
    expect(forMember.columns.map((c) => c.heading)).toContain("Entities");
  });

  it("hides every extra from a guest and shows each to a member", () => {
    const extras = [
      "/future-releases",
      "/completions",
      "/random",
      "/quote",
      "/meme",
      "/library/studio",
      "/library/seiyuu",
    ];
    const forGuest = routesFor(holdsNothing);
    const forMember = routesFor(holdsMember, memberFeatures);
    for (const to of extras) {
      expect(forGuest, to).not.toContain(to);
      expect(forMember, to).toContain(to);
    }
  });
});

describe("visibleSections - the entity rows, one key per kind", () => {
  const ENTITY_ROWS = {
    "/library/studio": "view.studio",
    "/library/publisher": "view.publisher",
    "/library/person": "view.person",
    "/library/seiyuu": "view.person",
    "/library/character": "view.character",
  };
  const KEYS = [...new Set(Object.values(ENTITY_ROWS))];
  // The guest's media types are held throughout, so the Library tab is drawn
  // and only the entity keys vary.
  const routesHolding = (held) =>
    visibleSections(NAV_SECTIONS, (p) => GUEST.has(p) || held.includes(p)).flatMap((s) =>
      sectionItems(s).map((i) => i.to),
    );

  it("hides a library row when only its kind is off", () => {
    for (const key of KEYS) {
      // The other three kinds are on, so the Entities column is drawn and
      // a missing row is this key's doing.
      const routes = routesHolding(KEYS.filter((k) => k !== key));
      for (const [to, asks] of Object.entries(ENTITY_ROWS)) {
        if (asks === key) expect(routes, `${key} off`).not.toContain(to);
        else expect(routes, `${key} off`).toContain(to);
      }
    }
  });

  it("shows every row with all four kinds on", () => {
    const routes = routesHolding(KEYS);
    for (const to of Object.keys(ENTITY_ROWS)) expect(routes).toContain(to);
  });
});

describe("the two permission surfaces agree", () => {
  // The SPA gates in two independent places: App.jsx's <ProtectedRoute> and
  // this file. Changing what a permission means reaches one and not the
  // other - Phase A shipped `is_admin` and had to fix the nav two commits
  // later, and until 2026-09-12 the per-user pages asked `requireAuth` at the
  // route while asking self.list here, so they were reachable but unlisted.
  //
  // This cannot compare the two files directly without importing App.jsx's
  // route tree, so it pins the nav half and names the route half it must
  // match. If you change one, this list is where the other is written down.
  const ROUTE_GATES = {
    "/plan": "self.list",
    "/seasonal": "self.list",
    "/statistics": "self.list",
    "/settings": "self.list",
    "/users": "admin.authz",
    "/roles": "admin.authz",
    "/content-labels": ["admin.authz", "manage.catalog"],
    "/access-modes": "admin.authz",
    "/system": "manage.pipelines",
    "/clean-orphans": "manage.pipelines",
    "/business-logic": "manage.pipelines",
    "/library/studio": "view.studio",
    "/library/publisher": "view.publisher",
    "/library/person": "view.person",
    "/library/character": "view.character",
    "/library/seiyuu": "view.person",
    "/future-releases": "view.extras",
    "/completions": "view.extras",
    "/random": "view.extras",
    "/resources": "manage.resources",
    "/options": "manage.options",
    "/aliases": "manage.options",
    "/external-apis": "manage.options",
    "/images": "manage.images",
    "/add": "manage.catalog",
    "/defaults": "manage.catalog",
    "/random-defaults": "manage.catalog",
    "/request-inbox": "manage.requests",
  };

  it("asks the same permission the route gate asks", () => {
    for (const [to, expected] of Object.entries(ROUTE_GATES)) {
      const section = NAV_SECTIONS.find((s) =>
        sectionItems(s).some((i) => i.to === to),
      );
      expect(section, `no nav section owns ${to}`).toBeDefined();
      const item = sectionItems(section).find((i) => i.to === to);
      const asked = itemRequirement(item) ?? sectionRequirement(section);
      expect(asked, `${to} disagrees with its route gate`).toEqual(expected);
    }
  });
});

describe("the Restricted section", () => {
  const holdsEverything = () => true;
  const restricted = () => NAV_SECTIONS.find((s) => s.key === "restricted");
  const sectionRoutes = (key, canSeeType) =>
    visibleSections(NAV_SECTIONS, holdsEverything, canSeeType)
      .filter((s) => s.key === key)
      .flatMap((s) => sectionItems(s).map((i) => i.to));
  const visibleKeys = (canSeeType) =>
    visibleSections(NAV_SECTIONS, holdsEverything, canSeeType).map((s) => s.key);

  it("sits right after Library and holds only gated rows", () => {
    const keys = NAV_SECTIONS.map((s) => s.key);
    expect(keys.indexOf("restricted")).toBe(keys.indexOf("library") + 1);
    const items = sectionItems(restricted());
    expect(items.map((i) => i.label)).toEqual(["H-Comic", "H-Game", "Hentai"]);
    for (const item of items) expect(item.gatedType).toBeTruthy();
  });

  it("no longer lists H-Comic in the Library", () => {
    const libraryRoutes = sectionItems(
      NAV_SECTIONS.find((s) => s.key === "library"),
    ).map((i) => i.to);
    expect(libraryRoutes).not.toContain("/library/h-comic");
  });

  it("is shown, with H-Comic, to a session that can see h-comic", () => {
    // The mirror of the next case, over the same NAV_SECTIONS, so a green
    // there proves the gate dropped the tab and not its absence from the data.
    expect(visibleKeys((type) => type === "h-comic")).toContain("restricted");
    expect(sectionRoutes("restricted", (type) => type === "h-comic")).toEqual([
      "/library/h-comic",
    ]);
  });

  it("is dropped entirely for a session that can see no gated type", () => {
    // The h-comic row is defined (asserted above), so this bites: even a
    // viewer holding every permission loses the tab, because the gate is the
    // mode's label, not a capability.
    expect(sectionItems(restricted()).some((i) => i.gatedType === "h-comic")).toBe(true);
    expect(visibleKeys(() => false)).not.toContain("restricted");
    expect(visibleKeys(undefined)).not.toContain("restricted");
    // Nothing in the library went with it.
    expect(sectionRoutes("library", () => false)).toContain("/library/manga");
    expect(sectionRoutes("library", () => false)).toContain("/library/game");
  });

  it("lights up on h-comic paths, not Library", () => {
    expect(activeSectionKey("/library/h-comic")).toBe("restricted");
    expect(activeSectionKey("/h-comic/3")).toBe("restricted");
    expect(activeSectionKey("/h-comic/3/some-title")).toBe("restricted");
    // The neighbours h-comic could be mistaken for stay in the Library.
    expect(activeSectionKey("/library/comic")).toBe("library");
    expect(activeSectionKey("/library/manga")).toBe("library");
  });

  it("names the same gated type App.jsx's route guard asks for", () => {
    // App.jsx wraps /library/h-comic and /h-comic/:publicId in
    // <ProtectedRoute gatedType="h-comic" />; this is the nav half.
    const item = sectionItems(restricted()).find(
      (i) => i.to === "/library/h-comic",
    );
    expect(item.gatedType).toBe("h-comic");
    expect(activeItem("/h-comic/3/some-title").item).toBe(item);
  });
});

describe("the gated h-game row", () => {
  const holdsEverything = () => true;
  const restrictedRoutes = (canSeeType) =>
    visibleSections(NAV_SECTIONS, holdsEverything, canSeeType)
      .filter((s) => s.key === "restricted")
      .flatMap((s) => sectionItems(s).map((i) => i.to));

  it("is hidden from a session that cannot see it, whatever it may see", () => {
    // A session that sees h-comic still does not see h-game: each gated type
    // is asked about on its own.
    const routes = restrictedRoutes((type) => type === "h-comic");
    expect(routes).not.toContain("/library/h-game");
    expect(routes).toContain("/library/h-comic");
  });

  it("is shown to a session that can", () => {
    expect(restrictedRoutes((type) => type === "h-game")).toContain("/library/h-game");
  });

  it("names the gated type App.jsx's guard asks for, and owns its detail pages", () => {
    const item = sectionItems(NAV_SECTIONS.find((s) => s.key === "restricted")).find(
      (i) => i.to === "/library/h-game",
    );
    expect(item.gatedType).toBe("h-game");
    expect(activeItem("/h-game/3/some-title").item).toBe(item);
    // /game/... is not /h-game/...: the Game row keeps its own pages.
    expect(activeItem("/game/3/some-title").item).not.toBe(item);
  });
});

describe("the gated hentai row", () => {
  const holdsEverything = () => true;
  const restrictedRoutes = (canSeeType) =>
    visibleSections(NAV_SECTIONS, holdsEverything, canSeeType)
      .filter((s) => s.key === "restricted")
      .flatMap((s) => sectionItems(s).map((i) => i.to));

  it("sits after H-Game", () => {
    const labels = sectionItems(NAV_SECTIONS.find((s) => s.key === "restricted")).map(
      (i) => i.label,
    );
    expect(labels.indexOf("Hentai")).toBe(labels.indexOf("H-Game") + 1);
  });

  it("is hidden from a session that cannot see it, whatever else it may see", () => {
    // The two other gated types visible, so the list the gate reads is not
    // empty: a green here proves the hentai row itself was refused.
    const routes = restrictedRoutes((type) => type === "h-comic" || type === "h-game");
    expect(routes).toContain("/library/h-comic");
    expect(routes).toContain("/library/h-game");
    expect(routes).not.toContain("/library/hentai");
  });

  it("is shown to a session that can", () => {
    expect(restrictedRoutes((type) => type === "hentai")).toEqual(["/library/hentai"]);
  });

  it("names the gated type App.jsx's guard asks for, and owns its detail pages", () => {
    const item = sectionItems(NAV_SECTIONS.find((s) => s.key === "restricted")).find(
      (i) => i.to === "/library/hentai",
    );
    expect(item.gatedType).toBe("hentai");
    expect(activeItem("/hentai/3/some-title").item).toBe(item);
    expect(activeSectionKey("/hentai/3")).toBe("restricted");
    // /anime/... is not /hentai/...: the Anime row keeps its own pages.
    expect(activeItem("/anime/3/some-title").item).not.toBe(item);
  });
});

describe("visibleSections - the admin, who is not root", () => {
  // The admin holds exactly its own pages' keys. Its header is those pages
  // and nothing of the catalogue; a user is the mirror, holding a non-empty
  // set with none of the admin's keys in it.
  const routesFor = (has) =>
    visibleSections(NAV_SECTIONS, has, undefined, () => false).flatMap((s) =>
      sectionItems(s).map((i) => i.to),
    );
  const NOTE_PAGES = ["/content-labels", "/options", "/aliases", "/external-apis"];

  it("shows the admin Content Labels and the three Note pages under Note", () => {
    const note = visibleSections(NAV_SECTIONS, holdsAdmin).find((s) => s.key === "note");
    expect(note).toBeDefined();
    const routes = sectionItems(note).map((i) => i.to);
    for (const to of NOTE_PAGES) expect(routes, to).toContain(to);
  });

  it("shows a user none of them", () => {
    const routes = routesFor(holdsUser);
    // The user's header is drawn - it is not an empty set doing the refusing.
    expect(routes).toContain("/plan");
    for (const to of NOTE_PAGES) expect(routes, to).not.toContain(to);
  });

  it("shows the admin its own pages and no library, entry form or Plan", () => {
    const routes = routesFor(holdsAdmin);
    for (const to of ["/users", "/system", "/request-inbox", "/images", "/resources"]) {
      expect(routes, to).toContain(to);
    }
    for (const to of ["/library/anime", "/library/collection", "/plan", "/add", "/random"]) {
      expect(routes, to).not.toContain(to);
    }
  });
});

describe("visibleSections - Resources", () => {
  const routesFor = (has) =>
    visibleSections(NAV_SECTIONS, has).flatMap((s) => sectionItems(s).map((i) => i.to));

  it("is not offered to a user", () => {
    // The user's Insights tab is drawn (Statistics), so the missing row is
    // its own gate's doing.
    const routes = routesFor(holdsUser);
    expect(routes).toContain("/statistics");
    expect(routes).not.toContain("/resources");
  });

  it("is offered to super, which holds every key but admin.authz", () => {
    expect(routesFor((p) => p !== "admin.authz")).toContain("/resources");
  });
});
