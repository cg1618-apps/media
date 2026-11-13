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
    { key: "amount_total", label: "Total", type: "text", column: null, options: [] },
    {
      key: "amount_collected",
      label: "Collected amount",
      type: "text",
      column: null,
      options: [],
      personal: true,
      granted: null,
    },
    {
      key: "ng_reset",
      label: "NG Reset",
      type: "select",
      column: null,
      options: ["yes", "no"],
      default: "yes",
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
  link_pairs: true,
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
    fields: { amount_total: "30", ng_reset: "yes" },
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
  it("leaves the personal fields out of the form and sends no personal key", async () => {
    await renderAs(["manage.catalog", "self.personal_notes"]);
    const items = card("道具 Items");

    await userEvent.click(items.getByRole("button", { name: "Edit" }));
    expect(items.queryAllByLabelText("Collected")).toHaveLength(0);
    expect(items.queryAllByLabelText("Collected amount")).toHaveLength(0);
    await userEvent.click(items.getByRole("button", { name: "Save" }));

    expect(api.updateNote).toHaveBeenCalledTimes(1);
    const [id, payload] = vi.mocked(api.updateNote).mock.calls[0];
    expect(id).toBe("i1");
    expect(payload.title).toBe("Golden Seed");
    expect(payload).not.toHaveProperty("status");
    expect(payload.fields).toEqual({ amount_total: "30", ng_reset: "yes" });
    expect(api.markNote).not.toHaveBeenCalled();
  });
});
