// ContentLabelPicker's contracts for Modify's save: the picker reports the set
// it loaded, so the page can tell which labels the admin is ADDING, and an
// entry a label save has hidden from the admin's own mode is told apart from
// one that is merely unreachable. A 404 after a label save means hidden - a
// hidden entry answers as a missing one - while any other failure says nothing.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import ContentLabelPicker, {
  entryHiddenFromSession,
  labelsAdded,
  saveCollectionLabels,
  saveFranchiseLabels,
  saveSeriesLabels,
  withNsfw,
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


// --- The nsfw rule ----------------------------------------------------------

const VOCABULARY = [
  { system_id: "1", key: "nsfw", label: "NSFW", description: "不適合公開場合觀看" },
  { system_id: "2", key: "erotica", label: "擦邊肉番", description: "" },
];

it("withNsfw adds nsfw beside any other label, and only then", () => {
  expect(withNsfw(["erotica"])).toEqual(["erotica", "nsfw"]);
  expect(withNsfw(["nsfw"])).toEqual(["nsfw"]);
  expect(withNsfw([])).toEqual([]);
});

it("ticking a label ticks NSFW with it", async () => {
  stubFetch(() => [200, VOCABULARY]);
  const onChange = vi.fn();
  render(<ContentLabelPicker value={[]} onChange={onChange} />);

  fireEvent.click(await screen.findByLabelText("擦邊肉番"));

  expect(onChange).toHaveBeenCalledWith(["erotica", "nsfw"]);
});

it("NSFW is locked while another label is held, with the reason", async () => {
  stubFetch(() => [200, VOCABULARY]);
  render(<ContentLabelPicker value={["erotica", "nsfw"]} onChange={() => {}} />);

  const nsfw = await screen.findByLabelText("NSFW");
  expect(nsfw).toBeDisabled();
  expect(nsfw).toBeChecked();
  expect(nsfw.closest("label")).toHaveAttribute("title", "Carried with 擦邊肉番");
});

it("NSFW alone can be unticked", async () => {
  stubFetch(() => [200, VOCABULARY]);
  const onChange = vi.fn();
  render(<ContentLabelPicker value={["nsfw"]} onChange={onChange} />);

  const nsfw = await screen.findByLabelText("NSFW");
  expect(nsfw).not.toBeDisabled();
  fireEvent.click(nsfw);
  expect(onChange).toHaveBeenCalledWith([]);
});


// --- Group owners -----------------------------------------------------------

// Every grouping tier reads its own set from its own endpoint.
it.each([
  ["collection", "/api/content-labels/collection/c1"],
  ["franchise", "/api/content-labels/franchise/c1"],
  ["series", "/api/content-labels/series/c1"],
])("a %s owner reads its set from its own endpoint", async (kind, url) => {
  const fetchMock = stubFetch((u) =>
    u === url ? [200, ["erotica", "nsfw"]] : [200, VOCABULARY],
  );
  const onLoaded = vi.fn();
  render(
    <ContentLabelPicker
      owner={{ kind, id: "c1" }}
      value={[]}
      onChange={() => {}}
      onLoaded={onLoaded}
    />,
  );

  await waitFor(() =>
    expect(onLoaded).toHaveBeenCalledWith(["erotica", "nsfw"]),
  );
  expect(fetchMock.mock.calls.map((call) => call[0])).toContain(url);
});

it("a group owner with no id yet reads nothing", async () => {
  const fetchMock = stubFetch(() => [200, VOCABULARY]);
  render(
    <ContentLabelPicker
      owner={{ kind: "series", id: null }}
      value={[]}
      onChange={() => {}}
    />,
  );
  await screen.findByLabelText("NSFW");
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    "/api/content-labels/",
  ]);
});

function lastPut(fetchMock) {
  const [url, init] = fetchMock.mock.calls.at(-1);
  return { url, method: init.method, body: JSON.parse(init.body) };
}

it("saveCollectionLabels PUTs the set, with nsfw, to the collection", async () => {
  const fetchMock = stubFetch(() => [200, ["erotica", "nsfw"]]);
  await saveCollectionLabels("c1", ["erotica"]);
  expect(lastPut(fetchMock)).toEqual({
    url: "/api/content-labels/collection/c1",
    method: "PUT",
    body: { label_keys: ["erotica", "nsfw"] },
  });
});

it("saveSeriesLabels PUTs the set, with nsfw, to the series", async () => {
  const fetchMock = stubFetch(() => [200, ["erotica", "nsfw"]]);
  await saveSeriesLabels("s1", ["erotica"]);
  expect(lastPut(fetchMock)).toEqual({
    url: "/api/content-labels/series/s1",
    method: "PUT",
    body: { label_keys: ["erotica", "nsfw"] },
  });
});

it("an empty collection or series set is sent empty - nothing is required", async () => {
  const fetchMock = stubFetch(() => [200, []]);
  await saveCollectionLabels("c1", []);
  expect(lastPut(fetchMock).body).toEqual({ label_keys: [] });
  await saveSeriesLabels("s1", []);
  expect(lastPut(fetchMock).body).toEqual({ label_keys: [] });
});

it("saveFranchiseLabels still adds a gated franchise type's label", async () => {
  // The mirror of the case above: a franchise IS required to carry one, so
  // the empty-set result there is the tier's rule and not the saver's.
  const fetchMock = stubFetch(() => [200, []]);
  await saveFranchiseLabels("f1", [], "Hentai");
  expect(lastPut(fetchMock)).toEqual({
    url: "/api/content-labels/franchise/f1",
    method: "PUT",
    body: { label_keys: ["hentai", "nsfw"] },
  });
});

it("reports an admin's tick through onEdit and a load through onChange", async () => {
  stubFetch((url) =>
    url.includes("/entry/")
      ? [200, ["nsfw"]]
      : [
          200,
          [
            { system_id: "1", key: "nsfw", label: "NSFW" },
            { system_id: "2", key: "ecchi", label: "輕微色情" },
          ],
        ],
  );
  const onChange = vi.fn();
  const onEdit = vi.fn();

  render(
    <ContentLabelPicker
      owner={{ kind: "entry", mediaType: "anime", id: "e1" }}
      value={[]}
      onChange={onChange}
      onEdit={onEdit}
    />,
  );

  await waitFor(() => expect(onChange).toHaveBeenCalledWith(["nsfw"]));
  fireEvent.click(await screen.findByLabelText("輕微色情"));
  expect(onEdit).toHaveBeenCalledWith(["ecchi", "nsfw"]);
  expect(onChange).not.toHaveBeenCalledWith(["ecchi", "nsfw"]);
});
