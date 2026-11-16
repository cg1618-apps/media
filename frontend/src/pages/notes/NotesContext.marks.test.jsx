// Frontend: personal values on catalogue rows (note marks).
//
// Some values on a catalogue row are each viewer's own - an item's collected
// status and amount, an enemy's beaten, a stat's "Mine", a song's status. They
// are written through PUT /api/notes/{id}/mark (`api.markNote`), never through
// the catalogue PATCH, and they are edited inline on the row by anyone holding
// self.personal_notes, whether or not it may write the catalogue section.
//
// Every refusal below renders rows carrying personal values, so a missing
// control is the gate refusing and not an empty section; each is paired with
// the holder's mirror on the same rows.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");

let held = new Set();
let features = new Set();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (p) => held.has(p),
    hasFeature: (f) => features.has(f),
  }),
}));

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));

const ITEMS = {
  key: "items",
  shape: "structured",
  label: "道具 Items",
  scope: "catalog",
  require_any: [],
  hierarchical: false,
  fields: [
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    {
      key: "collected",
      label: "Collected",
      type: "select",
      column: "status",
      options: ["not collected", "enough collected", "fully collected", "skip"],
      default: "not collected",
      personal: true,
      granted: null,
    },
    {
      key: "has_amount",
      label: "Amount",
      type: "select",
      column: null,
      options: ["yes", "no"],
      default: "no",
      view_hidden: true,
    },
    {
      key: "amount_total",
      label: "Total",
      type: "text",
      column: null,
      options: [],
      shown_when: { field: "has_amount", value: "yes" },
    },
    {
      key: "amount_collected",
      label: "Collected amount",
      type: "text",
      column: null,
      options: [],
      personal: true,
      granted: null,
      shown_when: { field: "has_amount", value: "yes" },
    },
    {
      key: "ng_reset",
      label: "NG Reset",
      type: "select",
      column: null,
      options: ["yes", "no"],
      default: "yes",
      view_labels: { no: "Won't Reset" },
    },
  ],
};

const STATS = {
  key: "stats_and_points",
  shape: "structured",
  label: "屬性&配點 Stats",
  scope: "catalog",
  require_any: [],
  hierarchical: false,
  fields: [
    { key: "name", label: "Stat", type: "text", column: "title", options: [] },
    {
      key: "my_value",
      label: "Mine",
      type: "text",
      column: null,
      options: [],
      quick_edit: true,
      personal: true,
      granted: null,
    },
  ],
};

const MOD_STATUS = {
  key: "status",
  label: "Status",
  type: "select",
  column: "status",
  options: ["using", "dropped"],
  personal: true,
  granted: "mod_status",
};
const modsSection = (withStatus) => ({
  key: "mods_and_tools",
  shape: "structured",
  label: "模組&工具 Mods",
  scope: "catalog",
  require_any: [],
  hierarchical: false,
  fields: [
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    ...(withStatus ? [MOD_STATUS] : []),
  ],
});

const OP = {
  key: "op",
  shape: "music_track",
  label: "OP",
  scope: "catalog",
  kinds: [],
  default_kind: null,
  kind_category: null,
  statuses: ["Need", "Pending", "No Full Version", "Done"],
  default_status: null,
  personal_status: true,
  status_granted: "music_status",
  type_status_section: "music_status",
  type_statuses: ["All Done", "Done", "Need", "Pending", "No Full Version", "Not Done"],
  type_status_default: "Not Done",
};
const MUSIC_STATUS = {
  key: "music_status",
  shape: "text",
  label: "Music status",
  scope: "catalog",
  hidden: true,
  personal_status: true,
  status_granted: "music_status",
};

const ROWS = [
  {
    system_id: "i1",
    section: "items",
    title: "Golden Seed",
    status: "not collected",
    fields: { has_amount: "yes", amount_total: "30", ng_reset: "yes" },
    sort_index: 0,
  },
  {
    system_id: "s1",
    section: "stats_and_points",
    title: "Vigor",
    fields: { my_value: "20" },
    sort_index: 0,
  },
  { system_id: "m1", section: "mods_and_tools", title: "Seamless Co-op", status: "using", sort_index: 0 },
  { system_id: "song1", section: "op", title: "紅蓮華", status: "Need", sort_index: 0 },
  { system_id: "ms1", section: "music_status", kind: "op", status: "Not Done", sort_index: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchSections).mockResolvedValue([
    ITEMS,
    STATS,
    modsSection(true),
    OP,
    MUSIC_STATUS,
  ]);
  vi.mocked(api.fetchNotes).mockResolvedValue(ROWS);
  vi.mocked(api.markNote).mockResolvedValue({});
  vi.mocked(api.ngReset).mockResolvedValue({ cleared: 3 });
  vi.mocked(api.updateNote).mockResolvedValue({});
  features = new Set(["music_status", "mod_status"]);
});

async function renderAs(permissions) {
  held = new Set(permissions);
  render(<NotesTemplate ownerType="game" ownerId="g1" />);
  await waitFor(() => expect(screen.getByText("Golden Seed")).toBeInTheDocument());
}

const card = (label) => within(screen.getByText(label).closest(".bg-surface"));

// A user: self.personal_notes, no manage.catalog.
const USER = ["self.list", "self.personal_notes"];

describe("a personal value is a mark", () => {
  it("sets collected through PUT mark and never through the catalogue PATCH", async () => {
    await renderAs(USER);
    const items = card("道具 Items");
    // The user cannot edit the catalogue row itself.
    expect(items.queryByRole("button", { name: "Edit" })).toBeNull();

    await userEvent.selectOptions(items.getByLabelText("Collected"), "fully collected");

    expect(api.markNote).toHaveBeenCalledTimes(1);
    expect(api.markNote).toHaveBeenCalledWith("i1", { collected: "fully collected" });
    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it("saves the collected amount on blur, through PUT mark", async () => {
    await renderAs(USER);
    const amount = card("道具 Items").getByLabelText("Collected amount");
    await userEvent.type(amount, "12");
    await userEvent.tab();

    expect(api.markNote).toHaveBeenCalledWith("i1", { amount_collected: "12" });
    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it("saves a stat's Mine through PUT mark", async () => {
    await renderAs(USER);
    const mine = card("屬性&配點 Stats").getByLabelText("Mine");
    await userEvent.clear(mine);
    await userEvent.type(mine, "40");
    await userEvent.tab();

    expect(api.markNote).toHaveBeenCalledTimes(1);
    expect(api.markNote).toHaveBeenCalledWith("s1", { my_value: "40" });
    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it("marks a song's status and the list's status under the key status", async () => {
    await renderAs(USER);
    const op = card("OP");
    await userEvent.selectOptions(op.getByLabelText("紅蓮華 status"), "Done");
    expect(api.markNote).toHaveBeenCalledWith("song1", { status: "Done" });

    await userEvent.selectOptions(op.getByLabelText("OP status"), "All Done");
    expect(api.markNote).toHaveBeenCalledWith("ms1", { status: "All Done" });

    expect(api.updateNote).not.toHaveBeenCalled();
    expect(api.createNote).not.toHaveBeenCalled();
  });
});

describe("who edits a personal value", () => {
  it("gives a viewer without self.personal_notes no personal control, only the values", async () => {
    await renderAs(["manage.catalog"]);

    expect(screen.queryByLabelText("Collected")).toBeNull();
    expect(screen.queryByLabelText("Collected amount")).toBeNull();
    expect(screen.queryByLabelText("Mine")).toBeNull();
    expect(screen.queryByLabelText("紅蓮華 status")).toBeNull();
    expect(screen.queryByLabelText("OP status")).toBeNull();
    expect(screen.queryByRole("button", { name: "NG reset" })).toBeNull();
    // The rows are there and read: the refusal is the gate's.
    expect(screen.getByText("not collected")).toBeInTheDocument();
    expect(screen.getByText("Mine 20")).toBeInTheDocument();
    expect(screen.getByText("Need")).toBeInTheDocument();
  });

  it("gives the holder every personal control on the same rows (the mirror)", async () => {
    await renderAs(USER);

    expect(screen.getByLabelText("Collected")).toHaveValue("not collected");
    expect(screen.getByLabelText("Collected amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Mine")).toHaveValue("20");
    expect(screen.getByLabelText("紅蓮華 status")).toHaveValue("Need");
    expect(screen.getByLabelText("OP status")).toHaveValue("Not Done");
    expect(card("模組&工具 Mods").getByLabelText("Status")).toHaveValue("using");
    expect(screen.getByRole("button", { name: "NG reset" })).toBeInTheDocument();
  });

  it("draws no control for a granted value the sections listing leaves out", async () => {
    vi.mocked(api.fetchSections).mockResolvedValue([ITEMS, modsSection(false)]);
    await renderAs(USER);

    const mods = card("模組&工具 Mods");
    expect(mods.getByText("Seamless Co-op")).toBeInTheDocument();
    expect(mods.queryByLabelText("Status")).toBeNull();
    // The ungranted value on the same page still has its control.
    expect(screen.getByLabelText("Collected")).toBeInTheDocument();
  });

  it("draws no control for a granted value whose feature the account lacks", async () => {
    // The listing still carries both granted values, so their absence is the
    // feature check's doing; the mirror above holds both features.
    features = new Set();
    await renderAs(USER);

    expect(screen.queryByLabelText("紅蓮華 status")).toBeNull();
    expect(screen.queryByLabelText("OP status")).toBeNull();
    expect(card("模組&工具 Mods").queryByLabelText("Status")).toBeNull();
    expect(screen.getByText("Need")).toBeInTheDocument();
    // The ungranted values on the same page still have their controls.
    expect(screen.getByLabelText("Collected")).toBeInTheDocument();
    expect(screen.getByLabelText("Mine")).toHaveValue("20");
  });
});

describe("NG reset", () => {
  it("posts once for the owner after the inline confirm, and not before", async () => {
    await renderAs(USER);

    await userEvent.click(screen.getByRole("button", { name: "NG reset" }));
    expect(api.ngReset).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(api.ngReset).toHaveBeenCalledTimes(1));
    expect(api.ngReset).toHaveBeenCalledWith("game", "g1");
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("success", expect.stringContaining("3")));
  });

  it("sends nothing when the confirm is cancelled", async () => {
    await renderAs(USER);

    await userEvent.click(screen.getByRole("button", { name: "NG reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(api.ngReset).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "NG reset" })).toBeInTheDocument();
  });

  it("is not offered on a section with nothing a new cycle resets", async () => {
    await renderAs(USER);
    expect(card("屬性&配點 Stats").queryByRole("button", { name: "NG reset" })).toBeNull();
    expect(card("道具 Items").getByRole("button", { name: "NG reset" })).toBeInTheDocument();
  });
});

describe("a catalogue edit", () => {
  it("leaves the personal fields out of the form of a viewer who cannot mark", async () => {
    await renderAs(["manage.catalog"]);
    const items = card("道具 Items");

    await userEvent.click(items.getByRole("button", { name: "Edit" }));
    expect(items.getByLabelText("Name")).toHaveValue("Golden Seed");
    expect(items.queryAllByLabelText("Collected")).toHaveLength(0);
    expect(items.queryAllByLabelText("Collected amount")).toHaveLength(0);
    await userEvent.click(items.getByRole("button", { name: "Save" }));

    expect(api.updateNote).toHaveBeenCalledTimes(1);
    const [id, payload] = vi.mocked(api.updateNote).mock.calls[0];
    expect(id).toBe("i1");
    expect(payload.title).toBe("Golden Seed");
    expect(payload).not.toHaveProperty("status");
    expect(payload.fields).toEqual({ has_amount: "yes", amount_total: "30", ng_reset: "yes" });
    expect(api.markNote).not.toHaveBeenCalled();
  });

  it("carries every value the row shows for a viewer who may mark (the mirror)", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([
      { ...ROWS[0], fields: { ...ROWS[0].fields, amount_collected: "7" } },
      ...ROWS.slice(1),
    ]);
    await renderAs(["manage.catalog", "self.personal_notes"]);
    const items = card("道具 Items");
    await userEvent.click(items.getByRole("button", { name: "Edit" }));

    expect(items.getByLabelText("Collected")).toHaveValue("not collected");
    expect(items.getByLabelText("Total")).toHaveValue("30");
    expect(items.getByLabelText("Collected amount")).toHaveValue("7");
  });

  it("saves the catalogue through PATCH and only the changed personal values through the mark", async () => {
    await renderAs(["manage.catalog", "self.personal_notes"]);
    const items = card("道具 Items");
    await userEvent.click(items.getByRole("button", { name: "Edit" }));

    await userEvent.selectOptions(items.getByLabelText("Collected"), "enough collected");
    await userEvent.type(items.getByLabelText("Collected amount"), "12");
    await userEvent.click(items.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.markNote).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(api.updateNote).mock.calls[0];
    expect(id).toBe("i1");
    expect(payload).not.toHaveProperty("status");
    expect(payload.fields).toEqual({ has_amount: "yes", amount_total: "30", ng_reset: "yes" });
    expect(api.markNote).toHaveBeenCalledWith("i1", {
      collected: "enough collected",
      amount_collected: "12",
    });
  });

  it("writes no mark when no personal value changed", async () => {
    await renderAs(["manage.catalog", "self.personal_notes"]);
    const items = card("道具 Items");
    await userEvent.click(items.getByRole("button", { name: "Edit" }));
    await userEvent.click(items.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateNote).toHaveBeenCalledTimes(1));
    expect(api.markNote).not.toHaveBeenCalled();
  });

  it("clears a personal value emptied in the form", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([
      { ...ROWS[0], fields: { ...ROWS[0].fields, amount_collected: "7" } },
      ...ROWS.slice(1),
    ]);
    await renderAs(["manage.catalog", "self.personal_notes"]);
    const items = card("道具 Items");
    await userEvent.click(items.getByRole("button", { name: "Edit" }));
    await userEvent.clear(items.getByLabelText("Collected amount"));
    await userEvent.click(items.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.markNote).toHaveBeenCalledWith("i1", { amount_collected: null }));
  });

  it("carries a stat's Mine in its edit form, and saves a change through the mark", async () => {
    await renderAs(["manage.catalog", "self.personal_notes"]);
    const stats = card("屬性&配點 Stats");
    await userEvent.click(stats.getByRole("button", { name: "Edit" }));
    // The row's inline control is replaced by the form, so this is the form's.
    const mine = stats.getByLabelText("Mine");
    expect(mine).toHaveValue("20");
    await userEvent.clear(mine);
    await userEvent.type(mine, "35");
    await userEvent.click(stats.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.markNote).toHaveBeenCalledWith("s1", { my_value: "35" }));
    expect(vi.mocked(api.updateNote).mock.calls[0][1].fields).toBeNull();
  });

  it("asks no Mine in the edit form of a viewer who cannot mark", async () => {
    await renderAs(["manage.catalog"]);
    const stats = card("屬性&配點 Stats");
    await userEvent.click(stats.getByRole("button", { name: "Edit" }));
    expect(stats.getByLabelText("Stat")).toHaveValue("Vigor");
    expect(stats.queryByLabelText("Mine")).toBeNull();
  });
});

describe("an item's amount", () => {
  const withItem = (fields) =>
    vi.mocked(api.fetchNotes).mockResolvedValue([{ ...ROWS[0], fields }, ...ROWS.slice(1)]);

  it("reads as collected/total with no label, the collected half editable", async () => {
    // No ng_reset on the row, so a "yes" tag could only be has_amount's.
    withItem({ has_amount: "yes", amount_total: "30" });
    await renderAs(USER);
    const items = card("道具 Items");
    expect(items.getByLabelText("Collected amount")).toBeInTheDocument();
    expect(items.getByText("/30")).toBeInTheDocument();
    expect(items.queryByText(/Total/)).toBeNull();
    // has_amount steers; it is never drawn as a tag of its own.
    expect(items.queryByText("yes")).toBeNull();
  });

  it("reads as one tag for a viewer who cannot mark", async () => {
    await renderAs(["manage.catalog"]);
    expect(card("道具 Items").getByText("–/30")).toBeInTheDocument();
  });

  it("is not drawn on a row whose has_amount is no or missing", async () => {
    // The same row and total as the mirror above, so the absence is has_amount's.
    for (const fields of [{ amount_total: "30" }, { has_amount: "no", amount_total: "30" }]) {
      withItem(fields);
      const { unmount } = render(<NotesTemplate ownerType="game" ownerId="g1" />);
      held = new Set(USER);
      await waitFor(() => expect(screen.getByText("Golden Seed")).toBeInTheDocument());
      const items = card("道具 Items");
      expect(items.queryByLabelText("Collected amount")).toBeNull();
      expect(items.queryByText(/30/)).toBeNull();
      // The collect status is still drawn: the row's personal values are there.
      expect(items.getByLabelText("Collected")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("creating an item", () => {
  const CURATOR = ["manage.catalog", "self.personal_notes"];

  async function openDraft(permissions) {
    vi.mocked(api.fetchNotes).mockResolvedValue(ROWS.slice(1));
    vi.mocked(api.createNote).mockResolvedValue({ system_id: "new1" });
    held = new Set(permissions);
    render(<NotesTemplate ownerType="game" ownerId="g1" />);
    await waitFor(() => expect(screen.getByText("Vigor")).toBeInTheDocument());
    await userEvent.click(card("道具 Items").getByRole("button", { name: "Add" }));
  }

  it("asks for the total only once Amount says yes", async () => {
    await openDraft(CURATOR);
    expect(screen.getByLabelText("Amount")).toHaveValue("no");
    expect(screen.queryByLabelText("Total")).toBeNull();
    expect(screen.queryByLabelText("Collected amount")).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText("Amount"), "yes");
    expect(screen.getByLabelText("Total")).toBeInTheDocument();
    expect(screen.getByLabelText("Collected amount")).toBeInTheDocument();
  });

  it("picks the collect status and amount, written as a mark after the create", async () => {
    await openDraft(CURATOR);
    await userEvent.type(screen.getByLabelText("Name"), "Rune");
    await userEvent.selectOptions(screen.getByLabelText("Collected"), "enough collected");
    await userEvent.selectOptions(screen.getByLabelText("Amount"), "yes");
    await userEvent.type(screen.getByLabelText("Total"), "12");
    await userEvent.type(screen.getByLabelText("Collected amount"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.markNote).toHaveBeenCalledTimes(1));
    const [payload] = vi.mocked(api.createNote).mock.calls[0];
    expect(payload.title).toBe("Rune");
    expect(payload).not.toHaveProperty("status");
    expect(payload.fields).toEqual({ has_amount: "yes", amount_total: "12", ng_reset: "yes" });
    expect(api.markNote).toHaveBeenCalledWith("new1", {
      collected: "enough collected",
      amount_collected: "4",
    });
  });

  it("writes no mark when only the defaults were left", async () => {
    await openDraft(CURATOR);
    await userEvent.type(screen.getByLabelText("Name"), "Rune");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createNote).toHaveBeenCalledTimes(1));
    expect(api.markNote).not.toHaveBeenCalled();
  });

  it("does not ask a viewer who cannot mark for a collect status (the mirror is above)", async () => {
    await openDraft(["manage.catalog"]);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Collected")).toBeNull();
  });
});

describe("an item's NG Reset", () => {
  const withItem = (fields) =>
    vi.mocked(api.fetchNotes).mockResolvedValue([{ ...ROWS[0], fields }, ...ROWS.slice(1)]);

  it("reads \"Won't Reset\" on a row that says no, last on its line", async () => {
    withItem({ has_amount: "yes", amount_total: "30", ng_reset: "no" });
    await renderAs(USER);
    const flag = card("道具 Items").getByText("Won't Reset");
    expect(flag.className).toContain("ml-auto");
    expect(flag.parentElement.lastElementChild).toBe(flag);
    expect(card("道具 Items").queryByText("no")).toBeNull();
  });

  it("reads nothing on a row that resets, said or by default (the mirror)", async () => {
    for (const fields of [{ ng_reset: "yes" }, {}]) {
      withItem(fields);
      const { unmount } = render(<NotesTemplate ownerType="game" ownerId="g1" />);
      held = new Set(USER);
      await waitFor(() => expect(screen.getByText("Golden Seed")).toBeInTheDocument());
      const items = card("道具 Items");
      expect(items.queryByText("Won't Reset")).toBeNull();
      expect(items.queryByText("yes")).toBeNull();
      unmount();
    }
  });
});
