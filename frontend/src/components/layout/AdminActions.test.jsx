// AdminActions: the admin strip on the twelve media-type detail pages. The
// editing actions (Edit, Autofill & update) sit at the left end, the status
// steps (Mark released, Mark completed) at the right end with Mark completed
// last, and the strip carries no "Admin" caption.
import { render, screen } from "@testing-library/react";

import AdminActions from "./AdminActions";

function renderStrip() {
  return render(
    <AdminActions
      start={
        <>
          <button type="button">Edit</button>
          <button type="button">Autofill &amp; update</button>
        </>
      }
      end={
        <>
          <button type="button">Mark released</button>
          <button type="button">Mark completed</button>
        </>
      }
    />,
  );
}

describe("AdminActions", () => {
  it("puts Edit and Autofill at the left, Mark released then Mark completed at the right", () => {
    renderStrip();
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Edit", "Autofill & update", "Mark released", "Mark completed"]);

    const start = screen.getByRole("group", { name: "Edit actions" });
    const end = screen.getByRole("group", { name: "Status actions" });
    expect(start).toContainElement(screen.getByRole("button", { name: "Edit" }));
    expect(start).toContainElement(screen.getByRole("button", { name: "Autofill & update" }));
    expect(end).toContainElement(screen.getByRole("button", { name: "Mark released" }));
    expect(end.lastElementChild).toBe(screen.getByRole("button", { name: "Mark completed" }));
  });

  it("keeps the status group right-aligned when it wraps to its own line", () => {
    renderStrip();
    const end = screen.getByRole("group", { name: "Status actions" });
    expect(end.className).toMatch(/\bml-auto\b/);
    expect(end.className).toMatch(/\bjustify-end\b/);
  });

  it("carries no Admin caption", () => {
    const { container } = renderStrip();
    expect(container.textContent).not.toMatch(/admin/i);
  });
});
