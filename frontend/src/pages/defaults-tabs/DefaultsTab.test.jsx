import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import DefaultsTab from "./DefaultsTab";
import { getFieldGroups } from "../../config/formFields";

const noop = () => {};

const AUTOFILL_HEADING = "Replace when choosing an existing entry";
const autofillBoxes = () =>
  screen.queryAllByRole("checkbox", { name: /^Replace .+ when choosing an existing entry$/ });
const autofillableKeys = (type, group) =>
  getFieldGroups(type)
    .filter((g) => group === undefined || g.group === group)
    .flatMap((g) => g.fields)
    .filter((f) => f.autofillable !== false)
    .map((f) => f.key);

function renderTab(
  type,
  draft = { defaults: {}, autofill: [], restricted_prefill: null },
  { setPrefill = noop, clearPrefill = noop, setGroupAutofill = noop } = {},
) {
  return render(
    <DefaultsTab
      type={type}
      draft={draft}
      setFieldDefault={noop}
      clearFieldDefault={noop}
      toggleAutofill={noop}
      setGroupAutofill={setGroupAutofill}
      setPrefill={setPrefill}
      clearPrefill={clearPrefill}
      sources={{ options: [], studios: [], people: {} }}
    />,
  );
}

const prefillInputs = () =>
  screen.getAllByRole("combobox", { name: "Prefilled restricted sources name" });

describe("DefaultsTab", () => {
  describe("auto-fill column", () => {
    it("heads the column once, and labels each tick without visible text", () => {
      renderTab("anime");

      expect(screen.getAllByText(AUTOFILL_HEADING)).toHaveLength(1);
      // The heading names the column, so a tick carries no text of its own -
      // only an accessible name, for when the grid collapses on a phone.
      expect(screen.queryByText("Auto-fill")).toBeNull();
      expect(autofillBoxes()).toHaveLength(autofillableKeys("anime").length);
      const [firstGroup] = getFieldGroups("anime");
      const first = firstGroup.fields.find((f) => f.autofillable !== false);
      expect(
        screen.getByRole("checkbox", {
          name: `Replace ${first.label} when choosing an existing entry`,
        }),
      ).toBeInTheDocument();
    });

    it("offers to select a whole group while one of its fields is unticked", () => {
      const setGroupAutofill = vi.fn();
      renderTab("anime", undefined, { setGroupAutofill });

      const groups = getFieldGroups("anime").filter(
        (g) => autofillableKeys("anime", g.group).length > 0,
      );
      const buttons = screen.getAllByRole("button", { name: "Select all" });
      expect(buttons).toHaveLength(groups.length);

      fireEvent.click(buttons[0]);
      expect(setGroupAutofill).toHaveBeenCalledWith(
        autofillableKeys("anime", groups[0].group),
        true,
      );
    });

    it("never offers to untick a group: the button goes once all are ticked", () => {
      // Every group fully ticked bar the first, which is missing one field.
      const all = autofillableKeys("anime");
      const [firstGroup] = getFieldGroups("anime").filter(
        (g) => autofillableKeys("anime", g.group).length > 0,
      );
      const missing = autofillableKeys("anime", firstGroup.group)[0];
      renderTab("anime", {
        defaults: {},
        autofill: all.filter((k) => k !== missing),
        restricted_prefill: null,
      });

      expect(screen.getAllByRole("button", { name: "Select all" })).toHaveLength(1);
      expect(screen.queryByText(/Auto-fill: none/)).toBeNull();
    });

    it("shows no auto-fill column on an entity tab", () => {
      // Studio, Person and Character have no "auto-fill from an existing record"
      // search on the Add page, so the whole column would be dead weight.
      renderTab("studio");

      expect(screen.queryByText(AUTOFILL_HEADING)).toBeNull();
      expect(autofillBoxes()).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
      // Not even the per-field "not auto-fillable" placeholder: a column of
      // dashes is noise on a tab where auto-fill does not exist at all.
      expect(screen.queryAllByText("—")).toHaveLength(0);
      // The fields themselves still render.
      expect(screen.getByText("Countries")).toBeInTheDocument();
    });
  });

  it("edits the sources default with the same editor the Add form uses", () => {
    renderTab("anime");

    // The repeater renders in place of the old "No default for this field".
    expect(screen.getByText("Main Sources")).toBeInTheDocument();
    expect(screen.getByText("+ Add reference source")).toBeInTheDocument();
  });

  it("hides main sources on the Game tab, mirroring its Add form", () => {
    renderTab("game");

    expect(screen.queryByText("Main Sources")).toBeNull();
    expect(screen.getByText("+ Add reference source")).toBeInTheDocument();
  });

  it("edits the game copies default with the copies editor", () => {
    renderTab("game", {
      defaults: { copies: [{ storefront: "Steam", ownership: "Owned" }] },
      autofill: [],
    });

    expect(screen.getByText("+ Add copy")).toBeInTheDocument();
    expect(screen.getByLabelText("Ownership for Steam")).toHaveValue("Owned");
  });

  describe("restricted prefill", () => {
    it("picks the prefill once per h-comic region, each offering its own names", () => {
      renderTab("h-comic");

      expect(screen.getByText("Restricted Prefill (JP)")).toBeInTheDocument();
      expect(screen.getByText("Restricted Prefill (KR)")).toBeInTheDocument();
      // Unpicked, each shows its built-in prefill: one name on JP, seven on KR.
      const values = prefillInputs().map((i) => i.value);
      expect(values).toEqual([
        "禁漫天堂",
        "禁漫天堂",
        "污汙漫畫",
        "漫小肆ikanhm",
        "ToonGod",
        "Anime Planet",
        "MANGA18",
        "MANGADNA",
      ]);
    });

    it("suggests each region's own names on its rows", () => {
      renderTab("h-comic", {
        defaults: {},
        autofill: [],
        restricted_prefill: { JP: [""], KR: [""] },
      });
      // A blank row suggests every name its region offers; the list is
      // portaled, so it is read off the open listbox.
      const offered = (input) => {
        fireEvent.focus(input);
        const names = within(screen.getByRole("listbox"))
          .getAllByRole("option")
          .map((o) => o.textContent);
        fireEvent.blur(input);
        return names;
      };
      const [jp, kr] = prefillInputs();
      expect(offered(kr)).toContain("ToonGod");
      expect(offered(jp)).not.toContain("ToonGod");
    });

    it("picks one prefill on every other type, suggesting its optional names too", () => {
      renderTab("book");

      expect(screen.getByText("Restricted Prefill")).toBeInTheDocument();
      // Book prefills nothing built-in, so the button offers all eight names.
      expect(
        screen.getByRole("button", { name: /prefill suggested \(8\)/i }),
      ).toBeInTheDocument();
    });

    it("leaves the restricted group out of the sources default", () => {
      renderTab("anime");
      expect(screen.queryByText("Restricted Sources")).toBeNull();
    });

    it.each(["game", "h-game"])("picks a prefill on %s, which has no built-in names", (type) => {
      renderTab(type);

      expect(screen.getByText("Restricted Prefill")).toBeInTheDocument();
      expect(screen.getByText("+ Add prefilled source")).toBeInTheDocument();
    });

    it("has no prefill row on a type with no Sources block", () => {
      renderTab("studio");
      expect(screen.queryByText(/Restricted Prefill/)).toBeNull();
    });

    it("stores an edit under its variant, and reverts it", () => {
      const setPrefill = vi.fn();
      const clearPrefill = vi.fn();
      renderTab(
        "h-comic",
        { defaults: {}, autofill: [], restricted_prefill: { KR: ["ToonGod"] } },
        { setPrefill, clearPrefill },
      );

      // JP is unpicked (its built-in), KR holds the pick.
      expect(prefillInputs().map((i) => i.value)).toEqual(["禁漫天堂", "ToonGod"]);
      fireEvent.change(prefillInputs()[1], { target: { value: "MANGA18" } });
      expect(setPrefill).toHaveBeenCalledWith("KR", ["MANGA18"]);

      fireEvent.click(screen.getByTitle(/Revert to built-in \(禁漫天堂, 污汙漫畫/));
      expect(clearPrefill).toHaveBeenCalledWith("KR");
    });
  });
});
