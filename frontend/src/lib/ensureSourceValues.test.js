import { describe, it, expect, vi } from "vitest";
import {
  computeMissingSourceValues,
  buildCreateRequest,
  ensureSourceValues,
  findOutOfScopeOption,
} from "./ensureSourceValues";

const sources = {
  options: [{ category: "Genre Main", value: "Action", scopes: [] }],
  studios: [{ display_name: "A-1 Pictures" }],
  people: {
    "director|anime": [{ display_name: "Abel Gongora" }],
  },
};

describe("computeMissingSourceValues", () => {
  it("excludes values already present for that source", () => {
    const result = computeMissingSourceValues(
      [
        {
          source: { kind: "option", category: "Genre Main" },
          values: ["Action", "Drama"],
        },
      ],
      sources,
    );
    expect(result).toEqual([
      { source: { kind: "option", category: "Genre Main" }, value: "Drama" },
    ]);
  });

  it("excludes an existing person for that role/scope", () => {
    const result = computeMissingSourceValues(
      [
        {
          source: { kind: "person", role: "director", scope: "anime" },
          values: ["Abel Gongora", "New Director"],
        },
      ],
      sources,
    );
    expect(result).toEqual([
      {
        source: { kind: "person", role: "director", scope: "anime" },
        value: "New Director",
      },
    ]);
  });

  it("ignores empty/falsy typed values", () => {
    const result = computeMissingSourceValues(
      [{ source: { kind: "studio" }, values: ["", null, undefined] }],
      sources,
    );
    expect(result).toEqual([]);
  });

  it("returns an empty list when nothing is missing", () => {
    expect(computeMissingSourceValues([], sources)).toEqual([]);
  });
});

describe("buildCreateRequest", () => {
  it("posts a studio as { name_en }", () => {
    const [url, init] = buildCreateRequest({ kind: "studio" }, "New Studio");
    expect(url).toBe("/api/studio/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name_en: "New Studio" });
  });

  // A publisher with no scope rows is offered NOWHERE, so a quick-create that
  // omitted the scope would make the publisher invisible in the very picker
  // that just created it - the publisher twin of the person bug above.
  it("posts a publisher with the scope the field asked for", () => {
    const [url, init] = buildCreateRequest(
      { kind: "publisher", scope: "game" },
      "Devolver",
    );
    expect(url).toBe("/api/publisher/");
    expect(JSON.parse(init.body)).toEqual({
      name_en: "Devolver",
      scopes: ["game"],
    });
  });

  it("omits scopes when the publisher field named none", () => {
    const [, init] = buildCreateRequest({ kind: "publisher" }, "Devolver");
    expect(JSON.parse(init.body)).toEqual({ name_en: "Devolver" });
  });

  it("posts a person as an unslotted { name } with role AND scope", () => {
    const [url, init] = buildCreateRequest(
      { kind: "person", role: "director", scope: "anime" },
      "New Director",
    );
    expect(url).toBe("/api/person/");
    expect(JSON.parse(init.body)).toEqual({
      name: "New Director",
      roles: [{ role: "director", scope: "anime" }],
    });
  });

  it("carries a non-anime scope through unchanged", () => {
    const [, init] = buildCreateRequest(
      { kind: "person", role: "illustrator", scope: "comic" },
      "New Artist",
    );
    expect(JSON.parse(init.body).roles).toEqual([
      { role: "illustrator", scope: "comic" },
    ]);
  });

  it("does not invent a null scope for a descriptor that lacks one", () => {
    // Replaces "posts a scopeless person role with scope: null". Every
    // descriptor carries a scope now and the API rejects a role without a
    // legal one, so sending scope: null would guarantee a 422 rather than
    // meaning "offered everywhere". A malformed descriptor should surface as
    // a failed create, not be quietly padded into an invalid request.
    const [, init] = buildCreateRequest(
      { kind: "person", role: "composer" },
      "New Composer",
    );
    expect(JSON.parse(init.body).roles[0]).not.toHaveProperty("scope", null);
  });

  it("posts an option with its category and scope array", () => {
    const [url, init] = buildCreateRequest(
      { kind: "option", category: "Genre Main", scope: "anime" },
      "Isekai",
    );
    expect(url).toBe("/api/options/");
    expect(JSON.parse(init.body)).toEqual({
      category: "Genre Main",
      value: "Isekai",
      scopes: ["anime"],
    });
  });

  it("posts an unscoped option with an empty scopes array", () => {
    const [, init] = buildCreateRequest(
      { kind: "option", category: "Genre Main" },
      "Isekai",
    );
    expect(JSON.parse(init.body).scopes).toEqual([]);
  });
});

describe("ensureSourceValues", () => {
  it("dispatches each missing value to the fetch call matching its kind", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await ensureSourceValues(
      [
        {
          source: { kind: "person", role: "director", scope: "anime" },
          values: ["Abel Gongora", "New Director"],
        },
        { source: { kind: "studio" }, values: ["New Studio"] },
        {
          source: { kind: "option", category: "Genre Main" },
          values: ["Action", "Isekai"],
        },
      ],
      sources,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const [personUrl, personInit] = fetchImpl.mock.calls.find(([url]) =>
      url.startsWith("/api/person"),
    );
    expect(personUrl).toBe("/api/person/");
    expect(JSON.parse(personInit.body)).toEqual({
      name: "New Director",
      roles: [{ role: "director", scope: "anime" }],
    });

    const [studioUrl, studioInit] = fetchImpl.mock.calls.find(([url]) =>
      url.startsWith("/api/studio"),
    );
    expect(studioUrl).toBe("/api/studio/");
    expect(JSON.parse(studioInit.body)).toEqual({ name_en: "New Studio" });

    const [optionUrl, optionInit] = fetchImpl.mock.calls.find(([url]) =>
      url.startsWith("/api/options"),
    );
    expect(optionUrl).toBe("/api/options/");
    expect(JSON.parse(optionInit.body)).toEqual({
      category: "Genre Main",
      value: "Isekai",
      scopes: [],
    });
  });

  it("makes no requests when everything already exists", async () => {
    const fetchImpl = vi.fn();
    await ensureSourceValues(
      [
        {
          source: { kind: "person", role: "director", scope: "anime" },
          values: ["Abel Gongora"],
        },
      ],
      sources,
      fetchImpl,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("scope widening for an option scoped elsewhere", () => {
  // 奇幻 exists as a manga genre. On the movie form the movie-scoped list
  // filters it out, so it reads as missing; creating it would 400 and leave
  // the movie tagged with a value its dropdown never shows.
  const scoped = {
    options: [
      {
        system_id: "o1",
        category: "Genre Main",
        value: "奇幻",
        sort_order: 3,
        remark: "r",
        scopes: ["manga"],
        usages: [],
        aliases: [],
      },
      { system_id: "o2", category: "Genre Main", value: "通用", scopes: [] },
    ],
  };
  const movieGenre = { kind: "option", category: "Genre Main", scope: "movie" };

  it("finds the out-of-scope option, case- and space-insensitively", () => {
    expect(findOutOfScopeOption(movieGenre, " 奇幻 ", scoped)?.system_id).toBe(
      "o1",
    );
  });

  it("never treats an unscoped option as out of scope", () => {
    // Adding a scope to an unscoped value would narrow it to one type.
    expect(findOutOfScopeOption(movieGenre, "通用", scoped)).toBeNull();
  });

  it("ignores a field with no scope", () => {
    expect(
      findOutOfScopeOption({ kind: "option", category: "Genre Main" }, "奇幻", scoped),
    ).toBeNull();
  });

  it("PUTs the option back with the field's scope added, not a create", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await ensureSourceValues(
      [{ source: movieGenre, values: ["奇幻", "新類型"] }],
      scoped,
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [putUrl, putInit] = fetchImpl.mock.calls.find(
      ([, init]) => init.method === "PUT",
    );
    expect(putUrl).toBe("/api/options/o1");
    expect(JSON.parse(putInit.body)).toEqual({
      category: "Genre Main",
      value: "奇幻",
      sort_order: 3,
      remark: "r",
      scopes: ["manga", "movie"],
      usages: [],
      aliases: [],
    });
    const [, postInit] = fetchImpl.mock.calls.find(
      ([, init]) => init.method === "POST",
    );
    expect(JSON.parse(postInit.body)).toEqual({
      category: "Genre Main",
      value: "新類型",
      scopes: ["movie"],
    });
  });
});
