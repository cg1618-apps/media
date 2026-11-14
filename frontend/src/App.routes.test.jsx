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
vi.mock("./pages/public/Completions", () => stub("completions"));
vi.mock("./pages/public/RandomPicker", () => stub("random picker"));
vi.mock("./pages/public/Quotes", () => stub("quotes"));
vi.mock("./pages/public/Memes", () => stub("memes"));
vi.mock("./pages/public/Resources", () => stub("resources"));

import App from "./App";

const MEMBER_KEYS = ["self.list", "view.studio", "view.publisher", "view.person", "view.character", "view.search", "view.random_picker", "view.extras"];

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
// permission asMember holds, view.extras included.
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
  "/future-releases": "future releases",
  "/completions": "completions",
  "/random": "random picker",
  "/random/anime": "random picker",
  "/random/h-comic": "random picker",
  "/random/h-game": "random picker",
  "/random/hentai": "random picker",
  "/quote": "quotes",
  "/meme": "memes",
  "/resources": "resources",
};

describe("a member-only route", () => {
  for (const [path, page] of Object.entries(CLOSED)) {
    it(`sends a guest from ${path} to log in`, async () => {
      asGuest();
      await visit(path);
      expect(await screen.findByText("login page")).toBeInTheDocument();
      expect(screen.queryByText(`${page} page`)).toBeNull();
      expect(window.location.search).toBe(`?next=${encodeURIComponent(path)}`);
    });

    it(`opens ${path} for a member`, async () => {
      asMember();
      await visit(path);
      expect(await screen.findByText(`${page} page`)).toBeInTheDocument();
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

  it("still open Resources to that member, an extra", async () => {
    asMemberWithoutQuotes();
    await visit("/resources");
    expect(await screen.findByText("resources page")).toBeInTheDocument();
  });
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
