// Frontend: tests for the `music_track` shape - OP, ED, 插入曲 and OST.
//
// What these pin: one row shape for every list (name, Song Type on OP and ED
// only, episode, text-and-URL link pairs, remark); the not-empty rule the
// server enforces, including that the prefilled Song Type cannot make a row
// worth saving; and the two statuses - each song's and the list's own in the
// header - which are the viewer's own: never in the song's form, marked
// through `onMark` under the key "status" by a viewer who may mark, and read
// as tags by anyone else.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MusicTrackSection from "./MusicTrackSection";

const TYPE_STATUSES = ["All Done", "Done", "Need", "Pending", "Not Done"];

const songList = (key, extra = {}) => ({
  key,
  shape: "music_track",
  label: key.toUpperCase(),
  kinds: [],
  default_kind: null,
  kind_category: null,
  statuses: ["Need", "Pending", "Done"],
  locator_placeholder: "Episode(s), e.g. ep 3",
  locator_required: false,
  desc_required: false,
  link_pairs: true,
  link_text_category: "Song Source",
  type_status_section: "music_status",
  type_statuses: TYPE_STATUSES,
  type_status_default: "Not Done",
  ...extra,
});

const OP = songList("op", { default_kind: "normal", kind_category: "Song Type" });
const OST = songList("ost");

const OPTIONS = {
  "Song Type": ["normal", "different version", "all inclusive version"],
  "Song Source": ["YouTube", "Spotify"],
};

const renderSection = (props = {}) =>
  render(
    <MusicTrackSection
      section={OP}
      notes={[]}
      canWrite
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      optionValues={OPTIONS}
      {...props}
    />,
  );

const openDraft = () => userEvent.click(screen.getByRole("button", { name: /^add$/i }));

// --- one song -------------------------------------------------------------

it("shows the name, type, episode, status, remark and labelled links", () => {
  renderSection({
    notes: [
      {
        system_id: "n1",
        title: "紅蓮華",
        kind: "different version",
        status: "Done",
        locator: "ep 1",
        content: "TV size only.",
        links: [
          { text: "YouTube", url: "https://youtu.be/abc" },
          { text: null, url: "https://open.spotify.com/x" },
        ],
      },
    ],
  });

  expect(screen.getByText("紅蓮華")).toBeInTheDocument();
  expect(screen.getByText("different version")).toBeInTheDocument();
  expect(screen.getByText("ep 1")).toBeInTheDocument();
  // The song's own status, as a tag - "Done" is also an option of the list
  // status select in the header.
  expect(
    screen.getAllByText("Done").filter((el) => el.tagName === "SPAN"),
  ).toHaveLength(1);
  expect(screen.getByText("TV size only.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /YouTube/ })).toHaveAttribute(
    "href",
    "https://youtu.be/abc",
  );
  // No text: the pill falls back to the host.
  expect(screen.getByRole("link", { name: /open\.spotify\.com/ })).toBeInTheDocument();
});

it("sends every field of a song, links as pairs", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await openDraft();
  await userEvent.type(screen.getByPlaceholderText("Song name (optional)"), "紅蓮華");
  const type = screen.getByLabelText("Song type");
  await userEvent.clear(type);
  await userEvent.type(type, "TV size");
  await userEvent.type(screen.getByLabelText("Episode"), "ep 1");
  await userEvent.type(screen.getByLabelText("Link text"), "YouTube");
  await userEvent.type(screen.getByLabelText("Link URL"), "https://youtu.be/abc");
  await userEvent.click(screen.getByRole("button", { name: "+ Add link" }));
  await userEvent.type(screen.getAllByLabelText("Link URL")[1], "https://b.example");
  await userEvent.type(screen.getByPlaceholderText("Remark (optional)"), "Full version.");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "op",
    title: "紅蓮華",
    kind: "TV size",
    locator: "ep 1",
    content: "Full version.",
    links: [
      { text: "YouTube", url: "https://youtu.be/abc" },
      { text: null, url: "https://b.example" },
    ],
  });
});

it("starts the Song Type on its default and suggests from Song Type", async () => {
  renderSection();
  await openDraft();
  const type = screen.getByLabelText("Song type");
  expect(type).toHaveValue("normal");
  expect(type).toHaveAttribute("role", "combobox");
  await userEvent.clear(type);
  await userEvent.type(type, "all");
  expect(screen.getByText("all inclusive version")).toBeInTheDocument();
});

it("suggests link text from the section's link text category", async () => {
  renderSection();
  await openDraft();
  await userEvent.type(screen.getByLabelText("Link text"), "Sp");
  expect(screen.getByText("Spotify")).toBeInTheDocument();
});

it("offers no Song Type on a list without one, and sends no kind", async () => {
  const onCreate = vi.fn();
  renderSection({ section: OST, onCreate });

  await openDraft();
  expect(screen.queryByLabelText("Song type")).not.toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText("Song name (optional)"), "Battle");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "ost",
    title: "Battle",
    locator: null,
    content: null,
    links: [],
  });
});

it("asks no status in the song's form: the status is the viewer's own", async () => {
  renderSection({ canMark: true, onMark: () => {} });

  await openDraft();
  expect(screen.queryByLabelText("Song status")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Episode")).toBeInTheDocument();
});

it("saves a song that carries only an episode", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await openDraft();
  await userEvent.type(screen.getByLabelText("Episode"), "ep 7");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ locator: "ep 7" }));
});

it("refuses a song carrying nothing but the prefilled type", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await openDraft();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).not.toHaveBeenCalled();
});

it("holds the save while a link label has no URL", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await openDraft();
  await userEvent.type(screen.getByPlaceholderText("Song name (optional)"), "紅蓮華");
  await userEvent.type(screen.getByLabelText("Link text"), "YouTube");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText("Link URL"), "https://youtu.be/abc");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalled();
});

it("reads a stored song back into the form, pairs included", async () => {
  const onUpdate = vi.fn();
  renderSection({
    notes: [
      {
        system_id: "n1",
        title: "紅蓮華",
        kind: "normal",
        locator: "ep 1",
        links: [{ text: "YouTube", url: "https://youtu.be/abc" }],
      },
    ],
    onUpdate,
  });

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Episode")).toHaveValue("ep 1");
  expect(screen.getByLabelText("Link text")).toHaveValue("YouTube");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onUpdate).toHaveBeenCalledWith(
    "n1",
    expect.objectContaining({
      links: [{ text: "YouTube", url: "https://youtu.be/abc" }],
    }),
  );
});

// --- the list's own status ------------------------------------------------

const STATUS_ROW = { system_id: "s1", section: "music_status", kind: "op", status: "Need" };

it("marks the list's status row under the key status", async () => {
  const onMark = vi.fn();
  const onCreate = vi.fn();
  const onUpdate = vi.fn();
  renderSection({ canMark: true, onMark, onCreate, onUpdate, typeStatusNote: STATUS_ROW });

  const select = screen.getByLabelText("OP status");
  expect(select).toHaveValue("Need");
  await userEvent.selectOptions(select, "Done");

  expect(onMark).toHaveBeenCalledWith("s1", { status: "Done" });
  expect(onUpdate).not.toHaveBeenCalled();
  expect(onCreate).not.toHaveBeenCalled();
});

it("reads a list with no status row as the default, with nothing to mark", () => {
  renderSection({ canMark: true, onMark: () => {} });
  expect(screen.queryByLabelText("OP status")).not.toBeInTheDocument();
  expect(screen.getByText("Not Done")).toBeInTheDocument();
});

it("gives a catalogue writer who may not mark the list status as a tag", () => {
  // canWrite alone: the catalogue is not where the status lives.
  renderSection({ canWrite: true, canMark: false, typeStatusNote: STATUS_ROW });
  expect(screen.queryByLabelText("OP status")).not.toBeInTheDocument();
  expect(screen.getByText("Need")).toBeInTheDocument();
});

it("marks a song's own status, and clears it with the blank option", async () => {
  const onMark = vi.fn();
  const onUpdate = vi.fn();
  renderSection({
    canWrite: false,
    canMark: true,
    onMark,
    onUpdate,
    notes: [{ system_id: "n1", title: "紅蓮華", status: "Need", links: [] }],
  });

  const select = screen.getByLabelText("紅蓮華 status");
  expect(select).toHaveValue("Need");
  await userEvent.selectOptions(select, "Done");
  expect(onMark).toHaveBeenLastCalledWith("n1", { status: "Done" });
  await userEvent.selectOptions(select, "");
  expect(onMark).toHaveBeenLastCalledWith("n1", { status: null });
  expect(onUpdate).not.toHaveBeenCalled();
});

it("shows a song's status as a tag to a viewer who may not mark", () => {
  renderSection({
    canMark: false,
    notes: [{ system_id: "n1", title: "紅蓮華", status: "Pending", links: [] }],
  });
  expect(screen.queryByLabelText("紅蓮華 status")).not.toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
});

it("shows the status as a tag to a reader who cannot edit", () => {
  renderSection({
    canWrite: false,
    typeStatusNote: { system_id: "s1", kind: "op", status: "Pending" },
  });
  expect(screen.queryByLabelText("OP status")).not.toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
});

it("opens an empty list, because it carries a status", () => {
  // Other empty sections open collapsed; a song list has its own status, so a
  // new anime's four "Not Done" lists open and say so.
  renderSection({ canWrite: false });
  expect(screen.getByText("No entries.")).toBeInTheDocument();
  expect(screen.getByText("Not Done")).toBeInTheDocument();
});

it("still collapses an empty list that carries no status", () => {
  // The mirror case: the same empty list without type_status_section keeps
  // the ordinary collapse-when-empty default, so the test above is the status
  // doing the opening.
  renderSection({ canWrite: false, section: songList("op", { type_status_section: null }) });
  expect(screen.queryByText("No entries.")).not.toBeInTheDocument();
});
