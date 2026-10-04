// The review queue page: each block loads on its own button, and a group
// marked reviewed leaves the list without a reload.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ReviewQueue from "./ReviewQueue";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ visibleGatedTypes: [] }),
}));

const alone = {
  franchise: [
    {
      system_id: "f1",
      public_id: 4,
      display_name: "Lonely",
      entry: { system_id: "a1", media_type: "anime", public_id: 12, display_name: "Only Child" },
    },
  ],
  series: [],
};

function respond(url) {
  if (url === "/api/data-control/check/alone-groups") return alone;
  if (url.endsWith("/reviewed")) return { system_id: "f1", alone_reviewed_media_id: "a1" };
  if (url === "/api/data-control/check/music") return [];
  return {};
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("loads nothing until a block's button is pressed", () => {
  render(
    <MemoryRouter>
      <ReviewQueue />
    </MemoryRouter>,
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("drops a reviewed group from the list", async () => {
  render(
    <MemoryRouter>
      <ReviewQueue />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Find single-entry groups" }));
  expect(await screen.findByText("Lonely")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Reviewed – keep" }));
  await waitFor(() => expect(screen.queryByText("Lonely")).not.toBeInTheDocument());
  expect(
    screen.getByText("No franchise or series is waiting with a single entry."),
  ).toBeInTheDocument();
});

it("shows an empty music block once it has loaded", async () => {
  render(
    <MemoryRouter>
      <ReviewQueue />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Find music" }));
  expect(await screen.findByText("No anime has music waiting.", { selector: "p.font-bold" }))
    .toBeInTheDocument();
});
