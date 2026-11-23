// A studio's people: links to each person, and no frame at all when none.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AffiliatedPeople from "./AffiliatedPeople";

vi.mock("../../hooks/useViewScope", () => ({
  useViewScope: () => ({ studio: true, publisher: true, person: true, character: true }),
}));

let people;
beforeEach(() => {
  people = [{ system_id: "p1", public_id: 7, display_name: "花澤香菜" }];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(people) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

const mount = () =>
  render(
    <MemoryRouter>
      <AffiliatedPeople studioId="s1" />
    </MemoryRouter>,
  );

it("links each person who belongs to the studio", async () => {
  mount();
  const link = await screen.findByRole("link", { name: "花澤香菜" });
  expect(link.getAttribute("href")).toMatch(/^\/person\//);
  expect(String(fetch.mock.calls[0][0])).toBe("/api/studio/s1/people");
});

it("draws nothing when nobody belongs to it", async () => {
  people = [];
  const { container } = mount();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
