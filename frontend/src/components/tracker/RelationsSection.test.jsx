// Frontend: tests for the Related Entries card's derived rows.
//
// A derived row is one the server inferred from a chain of peers rather than
// read from a stored relation, so it arrives with a null system_id and a `via`.
// Both matter here: the null id would collapse two rows onto one React key, and
// the `via` is the only thing on the page explaining why an entry is listed
// that the relations canvas draws no line to.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import RelationsSection from "./RelationsSection";

const other = (id, name) => ({
  media_type: "anime",
  entry_id: id,
  missing: false,
  display_name: name,
  label: "Anime",
  cover_image_file: null,
  franchise_id: null,
  nav_path: `/anime/${id}`,
});

const stored = {
  system_id: "row-1",
  relation_type: "corresponding",
  label: "Corresponding",
  family: "equivalence",
  direction: "forward",
  remark: null,
  derived: false,
  via: null,
  other: other("ubw", "Unlimited Blade Works"),
};

const derived = {
  system_id: null,
  relation_type: "corresponding",
  label: "Corresponding",
  family: "equivalence",
  direction: "forward",
  remark: null,
  derived: true,
  via: "Unlimited Blade Works",
  other: other("hf", "Heavens Feel"),
};

function mockRows(rows) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(rows) })),
  );
}

function renderCard() {
  return render(
    <MemoryRouter>
      <RelationsSection mediaType="anime" entryId="fsn" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RelationsSection derived rows", () => {
  it("lists a derived peer alongside the stored one", async () => {
    mockRows([stored, derived]);
    renderCard();
    await waitFor(() =>
      expect(screen.getByText("Unlimited Blade Works")).toBeInTheDocument(),
    );
    expect(screen.getByText("Heavens Feel")).toBeInTheDocument();
    // Both read as the same relation - the chain is how it was found, not what
    // it is - so the label must not be softened on the derived one.
    expect(screen.getAllByText("Corresponding")).toHaveLength(2);
  });

  it("says which link a derived row came through", async () => {
    mockRows([stored, derived]);
    renderCard();
    await waitFor(() =>
      expect(
        screen.getByText(/via Unlimited Blade Works/),
      ).toBeInTheDocument(),
    );
  });

  it("leaves a stored row without a via note", async () => {
    mockRows([stored]);
    renderCard();
    await waitFor(() =>
      expect(screen.getByText("Unlimited Blade Works")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/via /)).toBeNull();
  });

  it("keys two derived rows apart despite both having a null id", async () => {
    // The keys come from the pair and the kind. A component keyed on
    // system_id alone would put both of these on `null` and React would drop
    // one of them.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = {
      ...derived,
      via: "Heavens Feel",
      other: other("fourth", "Fourth Route"),
    };
    mockRows([derived, second]);
    renderCard();
    await waitFor(() =>
      expect(screen.getByText("Heavens Feel")).toBeInTheDocument(),
    );
    expect(screen.getByText("Fourth Route")).toBeInTheDocument();
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("same key")),
    ).toBe(false);
  });
});

// Prequel above Sequel. Both are stored as `sequel` rows; the side decides
// the label - read from the row's `from` side (direction "forward") the far
// entry is the Prequel. The server sends the Sequel first here, so a card
// that only kept the server's order would fail.
describe("RelationsSection timeline order", () => {
  const timeline = (id, name, direction, label) => ({
    system_id: `t-${id}`,
    relation_type: "sequel",
    label,
    family: "timeline",
    direction,
    remark: null,
    derived: false,
    via: null,
    other: other(id, name),
  });

  it("lists the Prequel above the Sequel", async () => {
    mockRows([
      timeline("s3", "Season 3", "reverse", "Sequel"),
      { ...stored, other: other("alt", "Alt Cut") },
      timeline("s1", "Season 1", "forward", "Prequel"),
    ]);
    renderCard();
    await screen.findByText("Season 1");
    const names = ["Season 1", "Season 3", "Alt Cut"];
    const order = names
      .map((n) => [n, screen.getByText(n)])
      .sort(([, a], [, b]) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map(([n]) => n);
    expect(order).toEqual(["Season 1", "Season 3", "Alt Cut"]);
  });
});
