import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DragHandle, SortableItem, SortableList, arrayMove } from "./Sortable";

function Harness({ initial = ["a", "b", "c"], disabled = false, byIndex = false, onMove }) {
  const [rows, setRows] = useState(initial);
  const ids = byIndex ? rows.map((_, i) => `new-${i}`) : rows;
  return (
    <SortableList
      ids={ids}
      disabled={disabled}
      onMove={(from, to) => {
        onMove?.(from, to);
        setRows((r) => arrayMove(r, from, to));
      }}
    >
      {rows.map((r, i) => (
        <SortableItem key={ids[i]} id={ids[i]} data-testid="row">
          <DragHandle label={r} />
          {r}
        </SortableItem>
      ))}
    </SortableList>
  );
}

const order = () => screen.getAllByTestId("row").map((el) => el.textContent);

describe("SortableList", () => {
  it("moves a row one place with the arrow keys on its handle", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByLabelText("Reorder c"), { key: "ArrowUp" });
    expect(order()).toEqual(["a", "c", "b"]);
    fireEvent.keyDown(screen.getByLabelText("Reorder a"), { key: "ArrowDown" });
    expect(order()).toEqual(["c", "a", "b"]);
  });

  it("keeps focus on the moved row's handle so a held key keeps moving it", () => {
    render(<Harness />);
    const handle = screen.getByLabelText("Reorder c");
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByLabelText("Reorder c"));
  });

  it("keeps focus on the moved row when ids are row indexes", () => {
    render(<Harness byIndex />);
    const handle = screen.getByLabelText("Reorder c");
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
    expect(order()).toEqual(["c", "a", "b"]);
    expect(document.activeElement).toBe(screen.getByLabelText("Reorder c"));
  });

  it("does nothing past either end", () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    fireEvent.keyDown(screen.getByLabelText("Reorder a"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByLabelText("Reorder c"), { key: "ArrowDown" });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("refuses every move while disabled", () => {
    const onMove = vi.fn();
    render(<Harness disabled onMove={onMove} />);
    expect(screen.getByLabelText("Reorder b")).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("Reorder b"), { key: "ArrowUp" });
    expect(onMove).not.toHaveBeenCalled();
    expect(order()).toEqual(["a", "b", "c"]);
  });
});
