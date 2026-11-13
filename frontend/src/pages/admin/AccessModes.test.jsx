// Frontend: the access-mode page.
//
// The modes and what each shows are defined in code and derived on the
// server, so the page shows them read-only and edits only a mode's name and
// description. These pin the order it draws them in, that nothing offers to
// change what a mode shows, and that a save PATCHes only the adjustable parts.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In the API's order - by sort_order, which runs widest first - so a page
// that drew them as given would fail the order test.
const MODES = [
  {
    system_id: "m4",
    key: "unrestricted",
    label: "Unrestricted",
    description: "Every entry and every field.",
    sort_order: 0,
    is_system: true,
    label_keys: ["nsfw", "ecchi", "erotica", "hentai", "h-game", "h-comic"],
    field_group_keys: ["credits"],
    user_count: 1,
  },
  {
    system_id: "m3",
    key: "borderline",
    label: "Borderline",
    description: null,
    sort_order: 1,
    is_system: true,
    label_keys: ["nsfw", "ecchi"],
    field_group_keys: ["credits"],
    user_count: 0,
  },
  {
    system_id: "m2",
    key: "normal",
    label: "Normal",
    description: "No labelled entries.",
    sort_order: 2,
    is_system: true,
    label_keys: [],
    field_group_keys: ["credits"],
    user_count: 3,
  },
  {
    system_id: "m1",
    key: "safe",
    label: "Safe",
    description: "What a signed-out visitor gets.",
    sort_order: 3,
    is_system: true,
    label_keys: [],
    field_group_keys: [],
    user_count: 0,
  },
];

const fetchJson = vi.fn();

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: () => {} }),
}));

vi.mock("../../api/client", () => ({
  fetchJson: (...args) => fetchJson(...args),
  jsonBody: (body) => ({ body }),
}));

const { default: AccessModes, sortModes } = await import("./AccessModes");

function renderPage() {
  render(<AccessModes />);
  return screen.findAllByRole("region");
}

describe("sortModes", () => {
  it("orders by the fixed mode order, not the API's", () => {
    expect(sortModes(MODES).map((m) => m.key)).toEqual([
      "safe",
      "normal",
      "borderline",
      "unrestricted",
    ]);
  });

  it("puts a key the code does not know last", () => {
    const keys = sortModes([{ key: "mystery" }, { key: "safe" }]).map(
      (m) => m.key,
    );
    expect(keys).toEqual(["safe", "mystery"]);
  });
});

describe("the access-mode page", () => {
  beforeEach(() => {
    fetchJson.mockReset();
    fetchJson.mockImplementation((url, opts) =>
      Promise.resolve(opts?.method === "PATCH" ? MODES[2] : MODES),
    );
  });

  it("draws the modes narrowest first", async () => {
    const cards = await renderPage();
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "safe",
      "normal",
      "borderline",
      "unrestricted",
    ]);
  });

  it("shows each mode's derived labels, field groups and account count", async () => {
    await renderPage();
    const borderline = screen.getByRole("region", { name: "borderline" });
    expect(within(borderline).getByText("ecchi")).toBeInTheDocument();
    expect(within(borderline).getByText("credits")).toBeInTheDocument();
    expect(within(borderline).queryByText("hentai")).not.toBeInTheDocument();
    const normal = screen.getByRole("region", { name: "normal" });
    expect(within(normal).getByText("3 account(s)")).toBeInTheDocument();
    expect(within(normal).getByText("No labels.")).toBeInTheDocument();
  });

  it("offers nothing that changes what a mode shows", async () => {
    // The page is drawn (the mirror is the first assertion), and it has no
    // checkbox, no radio, and no create or delete control anywhere.
    const cards = await renderPage();
    expect(cards).toHaveLength(4);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByText(/new access mode/i)).toBeNull();
    expect(screen.queryByText(/delete/i)).toBeNull();
  });

  it("reads only the mode list, never the removed catalog", async () => {
    await renderPage();
    const urls = fetchJson.mock.calls.map(([url]) => String(url));
    expect(urls).toContain("/api/access-modes/");
    expect(urls.some((u) => u.includes("catalog"))).toBe(false);
  });

  it("saves a renamed mode with PATCH, carrying only name and description", async () => {
    await renderPage();
    const normal = screen.getByRole("region", { name: "normal" });
    const save = within(normal).getByRole("button", { name: "Save" });
    // Nothing edited yet, so nothing to save.
    expect(save).toBeDisabled();

    fireEvent.change(within(normal).getByLabelText("Name"), {
      target: { value: "Everyday" },
    });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    await waitFor(() => {
      const patch = fetchJson.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(patch[0]).toBe("/api/access-modes/m2");
      expect(patch[1].body).toEqual({
        label: "Everyday",
        description: "No labelled entries.",
      });
    });
  });
});
