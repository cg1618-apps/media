// Frontend: a guest sees no personal-only note section.
//
// A `personal` section (Personal Notes, the 神回 highlights, the to-do lists)
// holds each viewer's own rows, and a guest has none and cannot write any, so
// for a guest it is never drawn - not even as an empty card. A signed-in
// viewer still gets it. The catalogue section beside it holds a row in both
// cases, so the guest's missing personal card is the gate and not a page that
// failed to render.
import { render, screen, waitFor } from "@testing-library/react";

import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");

let auth = {};
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => false, hasFeature: () => false, ...auth }),
}));

const TRIVIA = { key: "trivia", shape: "text", label: "Trivia", kinds: [], scope: "catalog" };
const PERSONAL = {
  key: "personal_notes",
  shape: "text",
  label: "個人筆記 Personal Notes",
  kinds: [],
  scope: "personal",
};

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue([TRIVIA, PERSONAL]);
  vi.mocked(api.fetchNotes).mockResolvedValue([
    { system_id: "c1", section: "trivia", content: "a catalogue fact", sort_index: 0 },
  ]);
});

it("draws no personal section for a guest", async () => {
  auth = { username: null, loading: false };
  render(<NotesTemplate ownerType="anime" ownerId="a1" />);
  await waitFor(() => expect(screen.getByText("a catalogue fact")).toBeInTheDocument());
  expect(screen.queryByText("個人筆記 Personal Notes")).toBeNull();
});

it("still draws it for a signed-in viewer", async () => {
  auth = { username: "reader", loading: false };
  render(<NotesTemplate ownerType="anime" ownerId="a1" />);
  await waitFor(() => expect(screen.getByText("a catalogue fact")).toBeInTheDocument());
  expect(screen.getByText("個人筆記 Personal Notes")).toBeInTheDocument();
});
