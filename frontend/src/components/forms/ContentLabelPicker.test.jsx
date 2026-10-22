// ContentLabelPicker's contracts for Modify's save: the picker reports the set
// it loaded, so the page can tell which labels the admin is ADDING, and an
// entry a label save has hidden from the admin's own mode is told apart from
// one that is merely unreachable. A 404 after a label save means hidden - a
// hidden entry answers as a missing one - while any other failure says nothing.
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import ContentLabelPicker, {
  entryHiddenFromSession,
  labelsAdded,
} from "./ContentLabelPicker";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(byUrl) {
  const fetchMock = vi.fn((url) => {
    const [status, body] = byUrl(url);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: () => Promise.resolve(body),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("labelsAdded names only the keys the chosen set adds", () => {
  expect(labelsAdded(["a"], ["a", "nsfw"])).toEqual(["nsfw"]);
  expect(labelsAdded(["a", "nsfw"], ["a"])).toEqual([]);
  expect(labelsAdded([], [])).toEqual([]);
});

it("labelsAdded treats an unloaded set as empty", () => {
  expect(labelsAdded(undefined, ["nsfw"])).toEqual(["nsfw"]);
});

it("reports the set it loaded through onLoaded", async () => {
  stubFetch((url) =>
    url.includes("/entry/") ? [200, ["borderline"]] : [200, []],
  );
  const onLoaded = vi.fn();

  render(
    <ContentLabelPicker
      owner={{ kind: "entry", mediaType: "anime", id: "e1" }}
      value={[]}
      onChange={() => {}}
      onLoaded={onLoaded}
    />,
  );

  await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(["borderline"]));
});

it("entryHiddenFromSession is true when the entry now answers 404", async () => {
  stubFetch(() => [404, { detail: "Anime not found" }]);
  expect(await entryHiddenFromSession("anime", "e1")).toBe(true);
});

it("entryHiddenFromSession is false while the entry still reads", async () => {
  const fetchMock = stubFetch(() => [200, { system_id: "e1" }]);
  expect(await entryHiddenFromSession("anime", "e1")).toBe(false);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/anime/e1");
});

it("entryHiddenFromSession does not claim hidden on any other failure", async () => {
  stubFetch(() => [500, { detail: "boom" }]);
  expect(await entryHiddenFromSession("anime", "e1")).toBe(false);

  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  expect(await entryHiddenFromSession("anime", "e1")).toBe(false);
});
