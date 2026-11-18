// Frontend: the Cover section that closes every entry form. The
// rule that matters is the cover's: on Add the row does not exist yet, so a
// picked image waits in `pending_image_id` for the page to attach after the
// save; on Modify (`ownerId` given) ImagePicker attaches it at once and
// nothing is left pending.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pickerProps = [];
vi.mock("./ImagePicker", () => ({
  default: (props) => {
    pickerProps.push(props);
    return (
      <div>
        <button type="button" onClick={() => props.onChange("library/pick.jpg", "img-1")}>
          Simulate cover pick
        </button>
        <button type="button" onClick={() => props.onFocusChange({ x: 0.2, y: 0.8 })}>
          Simulate focus
        </button>
      </div>
    );
  },
}));

import CoverFields from "./CoverFields";

beforeEach(() => {
  pickerProps.length = 0;
});

function renderFields(props = {}) {
  const u = vi.fn();
  const { container } = render(
    <CoverFields f={{ cover_image_file: "old.jpg" }} u={u} ownerType="manga" {...props} />,
  );
  return { u, container };
}

describe("CoverFields", () => {
  it("opens its own Cover section, holding the cover alone", () => {
    const { container } = renderFields();
    expect(
      [...container.querySelectorAll("[data-form-section]")].map((h) => h.dataset.formSection),
    ).toEqual(["Cover"]);
    expect([...container.querySelectorAll("label")].map((l) => l.textContent)).toEqual([
      "Cover Image",
    ]);
  });

  it("hands the picker the owner type, the cover role and the current file", () => {
    renderFields({ ownerId: "m-1" });
    const props = pickerProps.at(-1);
    expect(props.ownerType).toBe("manga");
    expect(props.ownerId).toBe("m-1");
    expect(props.role).toBe("cover");
    expect(props.value).toBe("old.jpg");
  });

  it("keeps a picked cover pending on Add, where the row does not exist yet", async () => {
    const { u } = renderFields();
    await userEvent.click(screen.getByRole("button", { name: "Simulate cover pick" }));
    expect(u).toHaveBeenCalledWith("cover_image_file", "library/pick.jpg");
    expect(u).toHaveBeenCalledWith("pending_image_id", "img-1");
  });

  it("leaves nothing pending on Modify, where the picker attaches at once", async () => {
    const { u } = renderFields({ ownerId: "m-1" });
    await userEvent.click(screen.getByRole("button", { name: "Simulate cover pick" }));
    expect(u).toHaveBeenCalledWith("cover_image_file", "library/pick.jpg");
    expect(u).toHaveBeenCalledWith("pending_image_id", null);
  });

  it("writes the focus point under its own key", async () => {
    const { u } = renderFields();
    await userEvent.click(screen.getByRole("button", { name: "Simulate focus" }));
    expect(u).toHaveBeenCalledWith("cover_image_focus", { x: 0.2, y: 0.8 });
  });

  it("offers no remark field: the remark lives in the Notes card", () => {
    renderFields();
    expect(screen.queryByRole("textbox", { name: "Remark" })).toBeNull();
  });

  it("writes nothing on mount", () => {
    const { u } = renderFields();
    expect(u).not.toHaveBeenCalled();
  });
});
