// Frontend: the Add/Modify tags fields offer the most-used values first, and a
// studio field offers only the studios of the form's own media type until
// something is typed. The studio fixtures include one credited only on a
// hentai, so "left out of the anime box" has something to leave out, and the
// typed cases read the same studio back.
import { describe, expect, it } from "vitest";

import { getIdleSourceValues, getSourceValues } from "./formatters";
import { withMediaType } from "./suggestionOrder";

const STUDIOS = [
  { system_id: "s-a", display_name: "Alpha Studio" },
  { system_id: "s-h", display_name: "Hentai Only Studio" },
  { system_id: "s-m", display_name: "Madhouse" },
  { system_id: "s-s", display_name: "Studio Shaft" },
];

const BAG = {
  options: [
    { system_id: "g-act", category: "Genre Main", value: "Action" },
    { system_id: "g-com", category: "Genre Main", value: "Comedy" },
    { system_id: "g-dra", category: "Genre Main", value: "Drama" },
    { system_id: "p-net", category: "Platform", value: "Netflix" },
    { system_id: "p-ama", category: "Platform", value: "Amazon" },
  ],
  studios: STUDIOS,
  people: {
    "director|anime": [
      { system_id: "d-1", display_name: "Anno" },
      { system_id: "d-2", display_name: "Miyazaki" },
      { system_id: "d-3", display_name: "Shinkai" },
    ],
  },
  publishers: {
    anime: [
      { system_id: "pub-1", display_name: "Muse" },
      { system_id: "pub-2", display_name: "Ani-One" },
    ],
  },
  usage: {
    anime: {
      studio: { "s-m": 5, "s-s": 2, "s-a": 2 },
      publisher: { "pub-1": 1, "pub-2": 4 },
      person: { director: { "d-3": 3, "d-2": 1 } },
      option: { "g-dra": 7, "g-act": 2, "p-ama": 9 },
    },
    hentai: { studio: { "s-h": 3 }, publisher: {}, person: {}, option: {} },
  },
};

const anime = withMediaType(BAG, "anime");
const hentai = withMediaType(BAG, "hentai");

describe("getSourceValues ordered by appearances", () => {
  it("puts the most-credited studios first, ties by name, unused last", () => {
    expect(getSourceValues(anime, { kind: "studio" })).toEqual([
      "Madhouse",
      "Alpha Studio",
      "Studio Shaft",
      "Hentai Only Studio",
    ]);
  });

  it("orders people per role on the descriptor's own scope", () => {
    expect(
      getSourceValues(BAG, { kind: "person", role: "director", scope: "anime" }),
    ).toEqual(["Shinkai", "Miyazaki", "Anno"]);
  });

  it("orders a publisher (distributor) list", () => {
    expect(getSourceValues(BAG, { kind: "publisher", scope: "anime" })).toEqual([
      "Ani-One",
      "Muse",
    ]);
  });

  it("orders the genre vocabulary under the form's media type", () => {
    expect(getSourceValues(anime, { kind: "option", category: "Genre Main" })).toEqual(
      ["Drama", "Action", "Comedy"],
    );
  });

  it("leaves a curated vocabulary in the order it came in", () => {
    // Amazon is the most used, and still second: Platform is not a genre or
    // label vocabulary, so its admin-set order stands.
    expect(getSourceValues(anime, { kind: "option", category: "Platform" })).toEqual([
      "Netflix",
      "Amazon",
    ]);
  });

  it("keeps the endpoint's order when the counts are not loaded", () => {
    const { usage: _usage, ...bag } = anime;
    expect(getSourceValues(bag, { kind: "studio" })).toEqual(
      STUDIOS.map((s) => s.display_name),
    );
  });
});

describe("getIdleSourceValues", () => {
  it("offers only the studios credited on the form's media type", () => {
    const idle = getIdleSourceValues(anime, { kind: "studio" });
    expect(idle).toEqual(["Madhouse", "Alpha Studio", "Studio Shaft"]);
    expect(idle).not.toContain("Hentai Only Studio");
  });

  it("offers that studio on the type it is credited on", () => {
    expect(getIdleSourceValues(hentai, { kind: "studio" })).toEqual([
      "Hentai Only Studio",
    ]);
  });

  it("still lists every studio for typing and the exists check", () => {
    expect(getSourceValues(anime, { kind: "studio" })).toContain("Hentai Only Studio");
  });

  it("scopes by the descriptor's own scope over the form's type", () => {
    // The manga form's Anime Studio field names the anime adaptation's studio.
    const manga = withMediaType(BAG, "manga");
    expect(getIdleSourceValues(manga, { kind: "studio", scope: "anime" })).toEqual([
      "Madhouse",
      "Alpha Studio",
      "Studio Shaft",
    ]);
  });

  it("does not narrow without counts, or for a field that is not a studio", () => {
    const { usage: _usage, ...bag } = anime;
    expect(getIdleSourceValues(bag, { kind: "studio" })).toBeUndefined();
    expect(
      getIdleSourceValues(anime, { kind: "option", category: "Genre Main" }),
    ).toBeUndefined();
  });
});
