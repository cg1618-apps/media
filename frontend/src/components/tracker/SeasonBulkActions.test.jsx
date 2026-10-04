// SeasonBulkActions' contracts: "Mark finished airing" writes only the
// season's Airing and Not Yet Aired anime and is absent when there are none;
// "Autofill & update" runs the single-entry Replace for every anime with a
// MAL link, one at a time, and reports what failed. Both ask first.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import SeasonBulkActions, { finishableAnime } from "./SeasonBulkActions";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));

const SEASON = [
  { system_id: "a1", anime_name_cn: "播出中", airing_status: "Airing", mal_link: "https://myanimelist.net/anime/1" },
  { system_id: "a2", anime_name_cn: "未播", airing_status: "Not Yet Aired", mal_link: "https://myanimelist.net/anime/2" },
  // Already finished, and cancelled: the finish step must leave both alone,
  // and they are what make "only the unfinished" a claim with teeth.
  { system_id: "a3", anime_name_cn: "完結", airing_status: "Finished Airing", mal_link: "https://myanimelist.net/anime/3" },
  { system_id: "a4", anime_name_cn: "腰斬", airing_status: "Canceled", mal_link: null },
];

function stubFetch(failIds = []) {
  const fetchMock = vi.fn((url) => {
    const failed = failIds.some((id) => url.endsWith(`/${id}`));
    return Promise.resolve({
      ok: !failed,
      json: () => Promise.resolve(failed ? { detail: "MAL said no" } : {}),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  showToast.mockReset();
});

it("finds only the Airing and Not Yet Aired anime", () => {
  expect(finishableAnime(SEASON).map((a) => a.system_id)).toEqual(["a1", "a2"]);
});

it("hides Mark finished airing when nothing is left to finish", () => {
  stubFetch();
  render(<SeasonBulkActions anime={SEASON.slice(2)} onDone={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /Mark finished airing/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Autofill & update" })).toBeInTheDocument();
});

it("marks the unfinished anime Finished Airing after confirming", async () => {
  const fetchMock = stubFetch();
  const onDone = vi.fn();
  render(<SeasonBulkActions anime={SEASON} onDone={onDone} />);

  fireEvent.click(screen.getByRole("button", { name: "Mark finished airing (2)" }));
  // Nothing is written before the confirmation.
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Mark 2 finished" }));

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/anime/a1", "/api/anime/a2"]);
  for (const [, init] of fetchMock.mock.calls) {
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ airing_status: "Finished Airing" });
  }
  expect(showToast).toHaveBeenCalledWith("success", "Marked 2 as finished airing");
});

it("autofills every anime with a MAL link and names the ones that failed", async () => {
  const fetchMock = stubFetch(["a2"]);
  const onDone = vi.fn();
  render(<SeasonBulkActions anime={SEASON} onDone={onDone} />);

  fireEvent.click(screen.getByRole("button", { name: "Autofill & update" }));
  fireEvent.click(screen.getByRole("button", { name: "Autofill 3" }));

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/data-control/replace/anime/a1",
    "/api/data-control/replace/anime/a2",
    "/api/data-control/replace/anime/a3",
  ]);
  expect(showToast).toHaveBeenCalledWith(
    "error",
    "Autofilled 2 of 3 · failed: 未播 (MAL said no)",
  );
});
