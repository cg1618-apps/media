// TagReplace's contracts: the picker lists the series' and then the rest of
// the franchise's other entries that carry a tag, a pick REPLACES each named
// field with the source's value - clearing one the source has empty - and a
// field the picker is not given (exclusive_source, on anime) is never touched
// however much the source holds of it.
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import TagReplace from "./TagReplace";
import { GENRE_LABEL_KEYS } from "../../lib/genreLabelFields";

const SIBLINGS = [
  // Newest first, as the list endpoint returns them: the franchise-only entry
  // comes before the same-series one, so series-first ordering is the
  // picker's doing and not the fixture's.
  {
    system_id: "e4",
    anime_name_cn: "劇場版",
    series_id: "s2",
    genre_main: "Drama",
    genre_sub: "",
    label: "",
  },
  {
    system_id: "e1",
    anime_name_cn: "第一季",
    series_id: "s1",
    genre_main: "Action, Fantasy",
    genre_sub: "",
    label: "原創",
    exclusive_source: "Netflix",
  },
  // The entry being edited: never offered as its own source.
  { system_id: "e2", anime_name_cn: "第二季", series_id: "s1", genre_main: "Action" },
  // Nothing to copy, so not offered either.
  { system_id: "e3", anime_name_cn: "OVA", series_id: "s1", genre_main: "", label: null },
];

function stubList(list = SIBLINGS) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(list) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// TagReplace is controlled: its onChange is the form's `ua`, so a minimal
// parent holds the state.
function Form({ initial, spy, entryId = "e2", franchiseId = "f1", seriesId = "s1" }) {
  const [, setValues] = useState(initial);
  return (
    <TagReplace
      mediaType="anime"
      franchiseId={franchiseId}
      seriesId={seriesId}
      entryId={entryId}
      fields={GENRE_LABEL_KEYS}
      onChange={(k, v) => {
        spy(k, v);
        setValues((p) => ({ ...p, [k]: v }));
      }}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const LABEL = "Replace genres & labels from";

it("lists the series' entries first, then the rest of the franchise", async () => {
  const fetchMock = stubList();
  render(<Form initial={{}} spy={vi.fn()} />);

  const picker = await screen.findByLabelText(LABEL);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/anime/?franchise_id=f1");
  const groups = [...picker.querySelectorAll("optgroup")].map((g) => [
    g.label,
    [...g.querySelectorAll("option")].map((o) => o.textContent),
  ]);
  // exclusive_source does not count towards the number shown.
  expect(groups).toEqual([
    ["This series", ["第一季 (3)"]],
    ["Rest of the franchise", ["劇場版 (1)"]],
  ]);
  expect(picker.querySelector("option").textContent).toBe(
    "Replace genres & labels from…",
  );
});

it("lists the franchise flat when the entry has no series", async () => {
  stubList();
  render(<Form initial={{}} spy={vi.fn()} seriesId={null} />);

  const picker = await screen.findByLabelText(LABEL);
  expect(picker.querySelectorAll("optgroup")).toHaveLength(0);
  const options = [...picker.querySelectorAll("option")].map((o) => o.textContent);
  expect(options).toEqual(["Replace genres & labels from…", "劇場版 (1)", "第一季 (3)"]);
});

it("replaces each field with the source's, clearing one the source has empty", async () => {
  stubList();
  const spy = vi.fn();
  render(
    <Form
      initial={{ genre_main: "Comedy", genre_sub: "Isekai", label: "", exclusive_source: "" }}
      spy={spy}
    />,
  );

  const picker = await screen.findByLabelText(LABEL);
  fireEvent.change(picker, { target: { value: "e1" } });

  await waitFor(() => expect(spy).toHaveBeenCalled());
  // genre_main is replaced, not merged: Comedy is gone. genre_sub held
  // Isekai and the source holds none, so it is cleared - that is the
  // difference from a merge, and the fixture's non-empty genre_sub is what
  // makes this assertion bite.
  expect(Object.fromEntries(spy.mock.calls)).toEqual({
    genre_main: "Action, Fantasy",
    genre_sub: "",
    label: "原創",
  });
  // The fixture's exclusive_source is non-empty, so this proves the replace
  // skipped it rather than finding nothing to copy.
  expect(spy.mock.calls.map(([k]) => k)).not.toContain("exclusive_source");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Replaced genres & labels with 第一季's. Save to keep them.",
  );
});

it("names what it replaces in its own words when given them", async () => {
  stubList([{ system_id: "e1", anime_name_cn: "第一季", series_id: "s1", genre_main: "A" }]);
  render(
    <TagReplace
      mediaType="anime"
      franchiseId="f1"
      seriesId="s1"
      entryId="e2"
      fields={["genre_main"]}
      what="genres"
      onChange={vi.fn()}
    />,
  );
  const picker = await screen.findByLabelText("Replace genres from");
  fireEvent.change(picker, { target: { value: "e1" } });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Replaced genres with 第一季's. Save to keep them.",
  );
});

it("renders nothing without a franchise, and fetches nothing", () => {
  const fetchMock = stubList();
  const { container } = render(<Form initial={{}} spy={vi.fn()} franchiseId="" />);
  expect(container).toBeEmptyDOMElement();
  expect(fetchMock).not.toHaveBeenCalled();
});
