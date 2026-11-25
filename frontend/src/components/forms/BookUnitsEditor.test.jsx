// BookUnitsEditor's contracts that matter for a book_unit row's shape:
// ch_count must only ever be sent for kind "arc" (the DB CHECK constraint
// ck_book_unit_ch_count_arc_only rejects it on any other kind), the kind
// picker only appears when the book's type offers more than one kind, and
// reordering moves rows and renumbers position (1-based) rather than
// reassigning kind or content.
import { fireEvent, render, screen } from "@testing-library/react";

import BookUnitsEditor from "./BookUnitsEditor";

// The picker's own behaviour is ImagePicker's tests'; here only which owner
// it is handed matters.
vi.mock("./ImagePicker", () => ({
  default: ({ ownerType, ownerId, value }) => (
    <div data-testid="unit-cover-picker" data-owner-type={ownerType} data-owner-id={ownerId}>
      {value}
    </div>
  ),
}));

it("adds a new row using the type's first kind and next position", () => {
  const onChange = vi.fn();
  render(<BookUnitsEditor items={[]} bookType="網路小說" onChange={onChange} />);

  fireEvent.click(screen.getByText(/\+ Add arc/));

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "arc", position: 1 }),
  ]);
});

it("does not show a kind selector when the type offers only one kind", () => {
  render(
    <BookUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      bookType="輕小說"
      onChange={() => {}}
    />,
  );

  expect(screen.queryByLabelText(/^Kind for /)).not.toBeInTheDocument();
  expect(screen.getByText("+ Add volume")).toBeInTheDocument();
});

it("shows a kind selector when the type offers multiple kinds", () => {
  render(
    <BookUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      bookType="其他"
      onChange={() => {}}
    />,
  );

  expect(screen.getByLabelText(/^Kind for /)).toBeInTheDocument();
  expect(screen.getByText("+ Add unit")).toBeInTheDocument();
});

it("shows the chapters input only for an arc row", () => {
  render(
    <BookUnitsEditor
      items={[
        { unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "" },
        { unit_kind: "volume", position: 2, unit_key: "", name_cn: "", name_en: "", remark: "" },
      ]}
      bookType="其他"
      onChange={() => {}}
    />,
  );

  expect(screen.getAllByPlaceholderText("chapters")).toHaveLength(1);
});

it("moves a row with its drag handle and renumbers position", () => {
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "A", name_cn: "", name_en: "", remark: "" },
    { unit_kind: "volume", position: 2, unit_key: "B", name_cn: "", name_en: "", remark: "" },
    { unit_kind: "volume", position: 3, unit_key: "C", name_cn: "", name_en: "", remark: "" },
  ];
  render(<BookUnitsEditor items={items} bookType="小說" onChange={onChange} />);

  // Moving the first row up is a no-op.
  fireEvent.keyDown(screen.getByLabelText("Reorder A"), { key: "ArrowUp" });
  expect(onChange).not.toHaveBeenCalled();

  // Moving the last row down is a no-op.
  fireEvent.keyDown(screen.getByLabelText("Reorder C"), { key: "ArrowDown" });
  expect(onChange).not.toHaveBeenCalled();

  // Moving the first row down swaps it with the second and renumbers.
  fireEvent.keyDown(screen.getByLabelText("Reorder A"), { key: "ArrowDown" });
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_key: "B", position: 1 }),
    expect.objectContaining({ unit_key: "A", position: 2 }),
    expect.objectContaining({ unit_key: "C", position: 3 }),
  ]);
});

it("removing a row renumbers the remaining rows", () => {
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "A", name_cn: "", name_en: "", remark: "" },
    { unit_kind: "volume", position: 2, unit_key: "B", name_cn: "", name_en: "", remark: "" },
  ];
  render(<BookUnitsEditor items={items} bookType="小說" onChange={onChange} />);

  fireEvent.click(screen.getAllByLabelText("Remove")[0]);

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_key: "B", position: 1 }),
  ]);
});

it("clears ch_count when a row's kind is changed away from arc", () => {
  const onChange = vi.fn();
  const items = [
    { unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "12" },
  ];
  render(<BookUnitsEditor items={items} bookType="其他" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "volume" } });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "volume", ch_count: "" }),
  ]);
});

it("does not force-clear ch_count when a row's kind is changed to arc", () => {
  // Only "網路小說" offers "arc", and it offers nothing else, so the only way to
  // reach an arc target via the select is a stranded non-arc row on a 網路小說
  // book (see the "stranded kind" annotated-option test below).
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "7" },
  ];
  render(<BookUnitsEditor items={items} bookType="網路小說" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "arc" } });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "arc", ch_count: "7" }),
  ]);
});

it("shows a disabled, annotated option for a stranded kind the current type no longer offers", () => {
  render(
    <BookUnitsEditor
      items={[{ unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "5" }]}
      bookType="輕小說"
      onChange={() => {}}
    />,
  );

  // 輕小說 offers only "volume", yet the stranded "arc" row still gets
  // a reachable selector, with its own current kind shown disabled.
  const select = screen.getByLabelText(/^Kind for /);
  expect(select.value).toBe("arc");
  const strandedOption = screen.getByText("arc (not valid for this type)");
  expect(strandedOption).toBeDisabled();
});

// A unit's rating and remark are each reader's own, written through
// /api/me/book-units from the detail page. The catalogue editor offers no
// control for either, and a row it adds carries neither key.
it("offers no rating or remark control on a row", () => {
  render(
    <BookUnitsEditor
      items={[{ unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", my_rating: "S", remark: "x" }]}
      bookType="網路小說"
      onChange={() => {}}
    />,
  );

  expect(screen.queryByLabelText(/^Rating for /)).toBeNull();
  expect(screen.queryByPlaceholderText("Remark")).toBeNull();
  expect(screen.queryByDisplayValue("x")).toBeNull();
});

it("adds a row with no personal keys", () => {
  const onChange = vi.fn();
  render(<BookUnitsEditor items={[]} bookType="網路小說" onChange={onChange} />);

  fireEvent.click(screen.getByText(/\+ Add arc/));

  const [[row]] = onChange.mock.calls[0];
  expect(row).not.toHaveProperty("my_rating");
  expect(row).not.toHaveProperty("remark");
});

describe("release dates and cover", () => {
  const saved = {
    system_id: "u1",
    unit_kind: "volume",
    position: 1,
    unit_key: "5",
    name_cn: "",
    name_en: "",
    release_date_jp: "2027-03",
    release_date_tw: "",
    cover_image_file: "library/abc.jpg",
  };

  it("edits a unit's JP and TW release dates", () => {
    const onChange = vi.fn();
    render(<BookUnitsEditor items={[saved]} bookType="輕小說" onChange={onChange} />);

    expect(screen.getByLabelText("JP release for 5")).toHaveValue("2027-03");
    fireEvent.change(screen.getByLabelText("TW release for 5"), {
      target: { value: "2027-09-15" },
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ release_date_jp: "2027-03", release_date_tw: "2027-09-15" }),
    ]);
  });

  it("offers the dates on every kind, not only volumes", () => {
    render(
      <BookUnitsEditor
        items={[{ ...saved, unit_kind: "arc", unit_key: "arc 2", ch_count: "" }]}
        bookType="網路小說"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("JP release for arc 2")).toBeInTheDocument();
    expect(screen.getByLabelText("TW release for arc 2")).toBeInTheDocument();
  });

  it("marks a malformed date and leaves a partial one alone", () => {
    render(
      <BookUnitsEditor
        items={[{ ...saved, release_date_jp: "next spring", release_date_tw: "2027" }]}
        bookType="輕小說"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("JP release for 5")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("TW release for 5")).not.toHaveAttribute("aria-invalid");
  });

  it("gives a saved unit a cover picker owned by that unit", () => {
    render(<BookUnitsEditor items={[saved]} bookType="輕小說" onChange={() => {}} />);

    const picker = screen.getByTestId("unit-cover-picker");
    expect(picker).toHaveAttribute("data-owner-type", "book-unit");
    expect(picker).toHaveAttribute("data-owner-id", "u1");
    expect(picker).toHaveTextContent("library/abc.jpg");
  });

  it("asks for a save before a new unit can take a cover", () => {
    const { system_id: _unsaved, ...fresh } = saved;
    render(<BookUnitsEditor items={[fresh]} bookType="輕小說" onChange={() => {}} />);

    expect(screen.queryByTestId("unit-cover-picker")).toBeNull();
    expect(screen.getByText("Cover after saving")).toBeInTheDocument();
  });

  it("starts a new row with empty dates", () => {
    const onChange = vi.fn();
    render(<BookUnitsEditor items={[]} bookType="輕小說" onChange={onChange} />);

    fireEvent.click(screen.getByText(/\+ Add volume/));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ release_date_jp: "", release_date_tw: "" }),
    ]);
  });
});

// A new unit's key is prefilled as its kind's next key - "Vol 1", "Arc 2" -
// counted within that kind, so a volume after two arcs is still "Vol 1".
describe("prefilled unit keys", () => {
  const row = (unit_kind, unit_key, position) => ({
    unit_kind, position, unit_key, name_cn: "", name_en: "", ch_count: "",
  });

  it("prefills the first volume as Vol 1 and the next arc as Arc 3", () => {
    const onChange = vi.fn();
    const { rerender } = render(<BookUnitsEditor items={[]} bookType="輕小說" onChange={onChange} />);
    fireEvent.click(screen.getByText("+ Add volume"));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ unit_key: "Vol 1" })]);

    rerender(
      <BookUnitsEditor
        items={[row("arc", "Arc 1", 1), row("arc", "Prologue", 2)]}
        bookType="網路小說"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("+ Add arc"));
    expect(onChange.mock.lastCall[0][2]).toEqual(expect.objectContaining({ unit_key: "Arc 3", position: 3 }));
  });

  it("counts within the kind on a mixed type", () => {
    const onChange = vi.fn();
    render(
      <BookUnitsEditor
        items={[row("story", "Story 1", 1), row("story", "Story 2", 2)]}
        bookType="其他"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("+ Add unit"));
    expect(onChange.mock.lastCall[0][2]).toEqual(expect.objectContaining({ unit_kind: "volume", unit_key: "Vol 1" }));
  });

  it("moves a still-prefilled key to the new kind, and leaves a typed one alone", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BookUnitsEditor items={[row("volume", "Vol 1", 1)]} bookType="其他" onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "story" } });
    expect(onChange.mock.lastCall[0][0]).toEqual(expect.objectContaining({ unit_kind: "story", unit_key: "Story 1" }));

    rerender(
      <BookUnitsEditor items={[row("volume", "Extra", 1)]} bookType="其他" onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "story" } });
    expect(onChange.mock.lastCall[0][0]).toEqual(expect.objectContaining({ unit_kind: "story", unit_key: "Extra" }));
  });
});
