// Frontend: App.jsx's route gates for the guest browse scope.
//
// A guest (no view.* key) reaches the dashboard, the media and group
// libraries and their detail pages; every member-only route sends them to log
// in. navigation.test.js pins the nav half of the same question; this pins the
// route half, against App.jsx's real route tree. Each closed route is asserted
// both ways with the same render, so a redirect is the gate's doing.
//
// The pages themselves are stubs: what is under test is which element a path
// resolves to, not what the page draws.
import { render, screen } from "@testing-library/react";
import { Outlet } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: { current: null } }));
vi.mock("./contexts/AuthContext", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => auth.current,
}));
vi.mock("./components/layout/Layout", () => ({ default: () => <Outlet /> }));

function stub(name) {
  return { default: () => <div>{name} page</div> };
}
vi.mock("./pages/public/Index", () => stub("dashboard"));
vi.mock("./pages/public/Login", () => stub("login"));
vi.mock("./pages/public/Register", () => stub("register"));
vi.mock("./pages/public/Search", () => stub("search"));
vi.mock("./pages/library/Library", () => stub("media library"));
vi.mock("./pages/library/FranchiseLibrary", () => stub("franchise library"));
vi.mock("./pages/library/CollectionLibrary", () => stub("collection library"));
vi.mock("./pages/detail/Franchise", () => stub("franchise"));
vi.mock("./pages/detail/Anime", () => stub("anime"));
vi.mock("./pages/library/StudioLibrary", () => stub("studio library"));
vi.mock("./pages/library/PublisherLibrary", () => stub("publisher library"));
vi.mock("./pages/library/PersonLibrary", () => stub("person library"));
vi.mock("./pages/library/CharacterLibrary", () => stub("character library"));
vi.mock("./pages/detail/Studio", () => stub("studio"));
vi.mock("./pages/detail/Publisher", () => stub("publisher"));
vi.mock("./pages/detail/Person", () => stub("person"));
vi.mock("./pages/detail/Character", () => stub("character"));
vi.mock("./pages/detail/Identity", () => stub("identity"));
vi.mock("./pages/public/FutureReleases", () => stub("future releases"));
vi.mock("./pages/public/SeasonalOverall", () => stub("seasonal"));
vi.mock("./pages/public/SeasonalDetail", () => stub("seasonal detail"));
vi.mock("./pages/public/Statistics", () => stub("statistics"));
vi.mock("./pages/public/Completions", () => stub("completions"));
vi.mock("./pages/public/RandomPicker", () => stub("random picker"));
vi.mock("./pages/public/Quotes", () => stub("quotes"));
vi.mock("./pages/public/Memes", () => stub("memes"));
vi.mock("./pages/public/Resources", () => stub("resources"));
vi.mock("./pages/admin/SystemOptions", () => stub("system options"));
vi.mock("./pages/admin/Aliases", () => stub("aliases"));
vi.mock("./pages/admin/ExternalApis", () => stub("external apis"));
vi.mock("./pages/admin/Images", () => stub("images"));

import App from "./App";

const MEMBER_KEYS = ["self.list", "view.studio", "view.publisher", "view.person", "view.character", "view.search", "view.random_picker"];

function session(permissions, username, features = []) {
  auth.current = {
    loading: false,
    username,
    has: (p) => permissions.includes(p),
    hasFeature: (f) => features.includes(f),
    visibleGatedTypes: ["h-comic", "h-game", "hentai"],
  };
}
const asGuest = () => session([], null);
const asMember = () => session(MEMBER_KEYS, "reader", ["quotes_memes"]);
// A member whose account does not have the quotes-and-memes switch on: every
// permission asMember holds.
const asMemberWithoutQuotes = () => session(MEMBER_KEYS, "reader");

async function visit(path) {
  window.history.pushState({}, "", path);
  render(<App />);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

// path -> the stub the route renders for a viewer holding the key.
const CLOSED = {
  "/library/studio": "studio library",
  "/library/publisher": "publisher library",
  "/library/person": "person library",
  "/library/seiyuu": "person library",
  "/library/character": "character library",
  "/studio/1": "studio",
  "/publisher/1": "publisher",
  "/person/1": "person",
  "/character/1": "character",
  "/identity/1": "identity",
  "/search": "search",
  "/completions": "completions",
  "/random": "random picker",
  "/random/anime": "random picker",
  "/random/h-comic": "random picker",
  "/random/h-game": "random picker",
  "/random/hentai": "random picker",
  "/quote": "quotes",
  "/meme": "memes",
};

describe("a member-only route", () => {
  for (const [path, page] of Object.entries(CLOSED)) {
    it(`sends a guest from ${path} to log in`, async () => {
      asGuest();
      await visit(path);
      expect(await screen.findByText("login page")).toBeInTheDocument();
      expect(screen.queryByText(`${page} page`)).toBeNull();
      expect(window.location.pathname).toBe("/login");
      expect(window.location.search).toBe("");
    });

    it(`opens ${path} for a member`, async () => {
      asMember();
      await visit(path);
      expect(await screen.findByText(`${page} page`)).toBeInTheDocument();
    });
  }
});

describe("the catalogue Explore routes", () => {
  // Future Releases, Seasonal and Statistics read the catalogue, so each asks
  // for any ordinary media type - a guest's nine keys open it, with no list -
  // and a session holding none (the admin's shape) is sent to log in.
  for (const [path, page] of [
    ["/future-releases", "future releases"],
    ["/seasonal", "seasonal"],
    [`/seasonal/${encodeURIComponent("SPR 2026")}`, "seasonal detail"],
    ["/statistics", "statistics"],
  ]) {
    it(`opens ${path} for a reader of one ordinary media type, without a list`, async () => {
      session(["media_type.anime"], null);
      await visit(path);
      expect(await screen.findByText(`${page} page`)).toBeInTheDocument();
    });

    it(`sends a session holding no media type from ${path} to log in`, async () => {
      // A list alone is not enough: the pages read the catalogue.
      session(["self.list"], "listonly");
      await visit(path);
      expect(await screen.findByText("login page")).toBeInTheDocument();
      expect(screen.queryByText(`${page} page`)).toBeNull();
    });
  }
});

describe("the quotes and memes routes", () => {
  for (const [path, page] of [
    ["/quote", "quotes"],
    ["/meme", "memes"],
  ]) {
    it(`send a member without the switch from ${path} to log in`, async () => {
      asMemberWithoutQuotes();
      await visit(path);
      expect(await screen.findByText("login page")).toBeInTheDocument();
      expect(screen.queryByText(`${page} page`)).toBeNull();
    });
  }

});

// The admin's own pages. The admin holds its fixed set and no catalogue key;
// a member holds a non-empty set with none of these keys in it, so its
// redirect is the gate's doing, and the admin opening the same path is the
// mirror.
const ADMIN_KEYS = [
  "admin.authz",
  "manage.pipelines",
  "manage.requests",
  "manage.announcements",
  "manage.options",
  "manage.images",
  "manage.resources",
];
const asAdmin = () => session(ADMIN_KEYS, "admin");
// Super holds every key but admin.authz; the ones these routes ask suffice.
const asSuper = () =>
  session(
    [...MEMBER_KEYS, "manage.catalog", "manage.options", "manage.images", "manage.resources"],
    "cg1618",
    ["quotes_memes"],
  );

describe("the admin's own pages", () => {
  const ADMIN_PAGES = {
    "/resources": "resources",
    "/options": "system options",
    "/aliases": "aliases",
    "/external-apis": "external apis",
    "/images": "images",
  };
  for (const [path, page] of Object.entries(ADMIN_PAGES)) {
    it(`sends a member from ${path} to log in`, async () => {
      asMember();
      await visit(path);
      expect(await screen.findByText("login page")).toBeInTheDocument();
      expect(screen.queryByText(`${page} page`)).toBeNull();
    });

    it(`opens ${path} for the admin, who holds no manage.catalog`, async () => {
      asAdmin();
      await visit(path);
      expect(await screen.findByText(`${page} page`)).toBeInTheDocument();
    });

    it(`opens ${path} for super`, async () => {
      asSuper();
      await visit(path);
      expect(await screen.findByText(`${page} page`)).toBeInTheDocument();
    });
  }
});

describe("a guest's open routes", () => {
  const OPEN = {
    "/": "dashboard",
    "/library/anime": "media library",
    "/library/franchise": "franchise library",
    "/library/collection": "collection library",
    "/franchise/1": "franchise",
    "/anime/1": "anime",
    // In no menu, but open: an invite link is used before any account exists.
    "/register?code=abc": "register",
  };
  for (const [path, page] of Object.entries(OPEN)) {
    it(`lets a guest into ${path}`, async () => {
      asGuest();
      await visit(path);
      expect(await screen.findByText(`${page} page`)).toBeInTheDocument();
    });
  }
});
