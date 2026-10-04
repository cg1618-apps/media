// TagImport's contracts: the picker lists the franchise's other entries that
// carry a tag, a pick appends the source's tags after the form's own without
// duplicating one, and a field the import is not given - quality, on anime -
// is never touched however much the source holds of it.
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import TagImport, { mergeTags } from "./TagImport";
import { ANIME_IMPORTED_TAGS } from "../../config/fieldOptions";

const SIBLINGS = [
  {
    system_id: "e1",
    anime_name_cn: "第一季",
    genre_main: "Action, Fantasy",
    genre_sub: "Isekai",
    label: "原創",
    quality: "神作畫",
  },
  // The entry being edited: never offered as its own source.
  { system_id: "e2", anime_name_cn: "第二季", genre_main: "Action" },
  // Nothing to import, so not offered either.
  { system_id: "e3", anime_name_cn: "OVA", genre_main: "", label: null },
];

function stubList(list = SIBLINGS) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(list) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// TagImport is controlled: its onChange is the form's `ua`, so a minimal
// parent holds the state and feeds it back as `values`.
function Form({ initial, spy, entryId = "e2", franchiseId = "f1" }) {
  const [values, setValues] = useState(initial);
  return (
    <TagImport
      mediaType="anime"
      franchiseId={franchiseId}
      entryId={entryId}
      fields={ANIME_IMPORTED_TAGS}
      values={values}
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

it("merges without duplicating and keeps the form's own order first", () => {
  expect(mergeTags("Action, Drama", "Drama, Fantasy")).toEqual({
    value: "Action, Drama, Fantasy",
    added: 1,
  });
  expect(mergeTags("", "A")).toEqual({ value: "A", added: 1 });
  expect(mergeTags("A", null)).toEqual({ value: "A", added: 0 });
});

it("lists the franchise's other anime that carry a genre or label", async () => {
  const fetchMock = stubList();
  render(<Form initial={{}} spy={vi.fn()} />);

  const picker = await screen.findByLabelText("Import genres and labels from");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/anime/?franchise_id=f1");
  const options = [...picker.querySelectorAll("option")].map((o) => o.textContent);
  // Quality does not count towards the number shown.
  expect(options).toEqual(["Import genres & labels from…", "第一季 (4)"]);
});

it("appends the sibling's genres and labels but never its quality", async () => {
  stubList();
  const spy = vi.fn();
  render(
    <Form
      initial={{ genre_main: "Action", genre_sub: "", label: "", quality: "作畫崩壞" }}
      spy={spy}
    />,
  );

  const picker = await screen.findByLabelText("Import genres and labels from");
  fireEvent.change(picker, { target: { value: "e1" } });

  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(Object.fromEntries(spy.mock.calls)).toEqual({
    genre_main: "Action, Fantasy",
    genre_sub: "Isekai",
    label: "原創",
  });
  // The fixture's quality is non-empty, so this proves the import skipped
  // it rather than finding nothing to copy.
  expect(spy.mock.calls.map(([k]) => k)).not.toContain("quality");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Imported 3 from 第一季 (1 already here). Save to keep them.",
  );
});

it("renders nothing without a franchise, and fetches nothing", () => {
  const fetchMock = stubList();
  const { container } = render(<Form initial={{}} spy={vi.fn()} franchiseId="" />);
  expect(container).toBeEmptyDOMElement();
  expect(fetchMock).not.toHaveBeenCalled();
});
