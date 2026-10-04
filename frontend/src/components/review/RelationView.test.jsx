// The relation review: single-entry franchises and series, each linked, each
// with a "Reviewed – keep" action that POSTs and drops the row.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import RelationView, { countAloneGroups } from "./RelationView";

let auth = { visibleGatedTypes: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const results = {
  franchise: [
    {
      system_id: "f1",
      public_id: 4,
      display_name: "Lonely",
      entry: { system_id: "a1", media_type: "anime", public_id: 12, display_name: "Only Child" },
    },
    {
      system_id: "f2",
      public_id: 5,
      display_name: "Gated",
      entry: { system_id: "h1", media_type: "h-game", public_id: 2, display_name: "Hidden" },
    },
  ],
  series: [
    {
      system_id: "s1",
      public_id: 8,
      display_name: "Single Series",
      entry: { system_id: "m1", media_type: "manga", public_id: 3, display_name: "Vol 1" },
    },
  ],
};

beforeEach(() => {
  auth = { visibleGatedTypes: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(onReviewed = vi.fn()) {
  render(
    <MemoryRouter>
      <RelationView results={results} onReviewed={onReviewed} />
    </MemoryRouter>,
  );
  return onReviewed;
}

it("links the group and its lone entry", () => {
  mount();
  expect(screen.getByRole("link", { name: "Lonely" })).toHaveAttribute("href", "/franchise/4/lonely");
  expect(screen.getByRole("link", { name: "Only Child" })).toHaveAttribute(
    "href",
    "/anime/12/only-child",
  );
});

it("hides a group whose lone entry is of a gated type the session cannot see", () => {
  mount();
  expect(screen.queryByText("Gated")).not.toBeInTheDocument();
  expect(countAloneGroups(results, auth)).toBe(2);
  auth = { visibleGatedTypes: ["h-game"] };
  expect(countAloneGroups(results, auth)).toBe(3);
});

it("marks a series reviewed and reports it", async () => {
  const onReviewed = mount();
  fireEvent.click(screen.getByRole("tab", { name: /Series/ }));
  fireEvent.click(screen.getByRole("button", { name: "Reviewed – keep" }));
  await waitFor(() => expect(onReviewed).toHaveBeenCalledWith("series", "s1"));
  expect(fetch).toHaveBeenCalledWith(
    "/api/data-control/check/alone-groups/series/s1/reviewed",
    expect.objectContaining({ method: "POST" }),
  );
});

it("shows the refusal when the group changed meanwhile", async () => {
  fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ detail: "This franchise no longer holds exactly one entry." }),
    }),
  );
  const onReviewed = mount();
  fireEvent.click(screen.getByRole("button", { name: "Reviewed – keep" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer holds exactly one entry");
  expect(onReviewed).not.toHaveBeenCalled();
});
