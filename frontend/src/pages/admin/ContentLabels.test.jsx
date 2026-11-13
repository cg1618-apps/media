// Frontend: the content-label reference.
//
// Labels are defined in code, so the page is a read-only table of what the
// server says about each: which modes show it, what it also carries, and how
// many entries and franchises carry it.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LABELS = [
  {
    system_id: "l1",
    key: "nsfw",
    label: "NSFW",
    description: "Not safe for work.",
    sort_order: 0,
    lowest_mode: "borderline",
    modes: ["borderline", "unrestricted"],
    also_carries: [],
    entry_count: 12,
    franchise_count: 2,
  },
  {
    system_id: "l2",
    key: "hentai",
    label: "Hentai",
    description: "Explicit animation.",
    sort_order: 3,
    lowest_mode: "unrestricted",
    modes: ["unrestricted"],
    also_carries: ["nsfw"],
    entry_count: 4,
    franchise_count: 1,
  },
];

const fetchJson = vi.fn();

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: () => {} }),
}));

vi.mock("../../api/client", () => ({
  fetchJson: (...args) => fetchJson(...args),
}));

const { default: ContentLabels } = await import("./ContentLabels");

async function rowFor(name) {
  render(<ContentLabels />);
  const cell = await screen.findByText(name);
  return cell.closest("tr");
}

describe("the label reference", () => {
  beforeEach(() => {
    fetchJson.mockReset();
    fetchJson.mockResolvedValue(LABELS);
  });

  it("says labels are defined in code", async () => {
    render(<ContentLabels />);
    expect(await screen.findByText(/labels are defined in code/i)).toBeInTheDocument();
  });

  it("shows each label's name, key, description and counts", async () => {
    const row = await rowFor("NSFW");
    expect(within(row).getByText("nsfw")).toBeInTheDocument();
    expect(within(row).getByText("Not safe for work.")).toBeInTheDocument();
    expect(within(row).getByText("12")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("lists the modes that show a label, in order", async () => {
    const row = await rowFor("NSFW");
    const chips = within(row)
      .getAllByText(/^(safe|normal|borderline|unrestricted)$/)
      .map((el) => el.textContent);
    expect(chips).toEqual(["borderline", "unrestricted"]);
  });

  it("says a label also carries NSFW, and only where it does", async () => {
    // Both rows are drawn; the note is on hentai's and not on nsfw's.
    const hentai = await rowFor("Hentai");
    expect(within(hentai).getByText(/also carries nsfw/i)).toBeInTheDocument();
    const nsfw = screen.getByText("NSFW").closest("tr");
    expect(within(nsfw).queryByText(/also carries/i)).toBeNull();
  });

  it("offers no way to create, rename or delete a label", async () => {
    await rowFor("NSFW");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
