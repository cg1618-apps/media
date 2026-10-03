import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import DefaultsTab from "./DefaultsTab";

const noop = () => {};

function renderTab(
  type,
  draft = { defaults: {}, autofill: [], restricted_prefill: null },
  { setPrefill = noop, clearPrefill = noop } = {},
) {
  return render(
    <DefaultsTab
      type={type}
      draft={draft}
      setFieldDefault={noop}
      clearFieldDefault={noop}
      toggleAutofill={noop}
      setGroupAutofill={noop}
      setPrefill={setPrefill}
      clearPrefill={clearPrefill}
      sources={{ options: [], studios: [], people: {} }}
    />,
  );
}

const prefillInputs = () =>
  screen.getAllByRole("combobox", { name: "Prefilled restricted sources name" });

describe("DefaultsTab", () => {
  it("offers auto-fill on a media type whose Add form has the search", () => {
    renderTab("anime");
    expect(screen.getAllByText("Auto-fill").length).toBeGreaterThan(0);
  });

  it("shows no auto-fill column on an entity tab", () => {
    // Studio, Person and Character have no "auto-fill from an existing record"
    // search on the Add page, so the whole column would be dead weight.
    renderTab("studio");

    expect(screen.queryByText("Auto-fill")).toBeNull();
    expect(screen.queryByText("Auto-fill: all")).toBeNull();
    // Not even the per-field "not auto-fillable" placeholder: a column of
    // dashes is noise on a tab where auto-fill does not exist at all.
    expect(screen.queryAllByText("—")).toHaveLength(0);
    // The fields themselves still render.
    expect(screen.getByText("Country")).toBeInTheDocument();
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
      renderTab("novel");

      expect(screen.getByText("Restricted Prefill")).toBeInTheDocument();
      // Novel prefills nothing built-in, so the button offers all eight names.
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
