// NovelUnitsEditor's contracts that matter for a novel_unit row's shape:
// ch_count must only ever be sent for kind "arc" (the DB CHECK constraint
// ck_novel_unit_ch_count_arc_only rejects it on any other kind), the kind
// picker only appears when the novel's type offers more than one kind, and
// reordering moves rows and renumbers position (1-based) rather than
// reassigning kind or content.
import { fireEvent, render, screen } from "@testing-library/react";

import NovelUnitsEditor from "./NovelUnitsEditor";

it("adds a new row using the type's first kind and next position", () => {
  const onChange = vi.fn();
  render(<NovelUnitsEditor items={[]} novelType="Web" onChange={onChange} />);

  fireEvent.click(screen.getByText(/\+ Add arc/));

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "arc", position: 1 }),
  ]);
});

it("does not show a kind selector when the type offers only one kind", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      novelType="Light Novel"
      onChange={() => {}}
    />,
  );

  expect(screen.queryByLabelText(/^Kind for /)).not.toBeInTheDocument();
  expect(screen.getByText("+ Add volume")).toBeInTheDocument();
});

it("shows a kind selector when the type offers multiple kinds", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      novelType="Other"
      onChange={() => {}}
    />,
  );

  expect(screen.getByLabelText(/^Kind for /)).toBeInTheDocument();
  expect(screen.getByText("+ Add unit")).toBeInTheDocument();
});

it("shows the chapters input only for an arc row", () => {
  render(
    <NovelUnitsEditor
      items={[
        { unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "" },
        { unit_kind: "volume", position: 2, unit_key: "", name_cn: "", name_en: "", remark: "" },
      ]}
      novelType="Other"
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
  render(<NovelUnitsEditor items={items} novelType="Novel" onChange={onChange} />);

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
  render(<NovelUnitsEditor items={items} novelType="Novel" onChange={onChange} />);

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
  render(<NovelUnitsEditor items={items} novelType="Other" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "volume" } });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "volume", ch_count: "" }),
  ]);
});

it("does not force-clear ch_count when a row's kind is changed to arc", () => {
  // Only "Web" offers "arc", and it offers nothing else, so the only way to
  // reach an arc target via the select is a stranded non-arc row on a Web
  // novel (see the "stranded kind" annotated-option test below).
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "7" },
  ];
  render(<NovelUnitsEditor items={items} novelType="Web" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "arc" } });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "arc", ch_count: "7" }),
  ]);
});

it("shows a disabled, annotated option for a stranded kind the current type no longer offers", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "5" }]}
      novelType="Light Novel"
      onChange={() => {}}
    />,
  );

  // Light Novel offers only "volume", yet the stranded "arc" row still gets
  // a reachable selector, with its own current kind shown disabled.
  const select = screen.getByLabelText(/^Kind for /);
  expect(select.value).toBe("arc");
  const strandedOption = screen.getByText("arc (not valid for this type)");
  expect(strandedOption).toBeDisabled();
});

// A unit's rating and remark are each reader's own, written through
// /api/me/novel-units from the detail page. The catalogue editor offers no
// control for either, and a row it adds carries neither key.
it("offers no rating or remark control on a row", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", my_rating: "S", remark: "x" }]}
      novelType="Web"
      onChange={() => {}}
    />,
  );

  expect(screen.queryByLabelText(/^Rating for /)).toBeNull();
  expect(screen.queryByPlaceholderText("Remark")).toBeNull();
  expect(screen.queryByDisplayValue("x")).toBeNull();
});

it("adds a row with no personal keys", () => {
  const onChange = vi.fn();
  render(<NovelUnitsEditor items={[]} novelType="Web" onChange={onChange} />);

  fireEvent.click(screen.getByText(/\+ Add arc/));

  const [[row]] = onChange.mock.calls[0];
  expect(row).not.toHaveProperty("my_rating");
  expect(row).not.toHaveProperty("remark");
});
