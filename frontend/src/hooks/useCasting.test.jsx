// useReplaceCasting's mutationFn is the ONE place both Add.jsx and
// Modify.jsx route a form's cast through on the way to PUT
// /api/casting/{media_type}/{entry_id}. CastEditor's emptyRow() starts every
// new row with character_id: null, and the server schema requires
// character_id on every row it does not drop itself - so a single unfilled
// trailing row used to 422 the WHOLE cast after the entry had already been
// saved. This filters those rows out before the request ever leaves the
// browser.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useReplaceCasting } from "./useCasting";

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "success" }),
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("drops a blank trailing row (no character_id) before PUTting the cast", async () => {
  const { result } = renderHook(() => useReplaceCasting(), { wrapper });

  const cast = [
    { character_id: "c1", role: "Main", position: 0 },
    // The blank row CastEditor's "+ Add cast member" leaves behind if the
    // admin never fills it in.
    { character_id: null, character_name: "", role: "", position: 1 },
  ];

  result.current.mutate({ mediaType: "anime", entryId: "e1", cast });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(fetch).toHaveBeenCalledTimes(1);
  const [, init] = fetch.mock.calls[0];
  const sentBody = JSON.parse(init.body);
  expect(sentBody.cast).toHaveLength(1);
  expect(sentBody.cast[0].character_id).toBe("c1");
});

// Role is optional: the editor's "—" option holds role "", which the server
// does not accept as a role, so it is sent as null. A chosen role is kept.
it("sends a blank role as null and keeps a chosen one", async () => {
  const { result } = renderHook(() => useReplaceCasting(), { wrapper });

  const cast = [
    { character_id: "c1", role: "", position: 0 },
    { character_id: "c2", role: "Supporting", position: 1 },
    { character_id: "c3", role: null, position: 2 },
  ];

  result.current.mutate({ mediaType: "anime", entryId: "e1", cast });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const [, init] = fetch.mock.calls[0];
  expect(JSON.parse(init.body).cast.map((r) => r.role)).toEqual([
    null,
    "Supporting",
    null,
  ]);
});

// A seiyuu line the editor shows but nobody picked a person for is not a
// voice; only voices naming a person are sent, a blank remark as null.
it("sends only the voices that name a person", async () => {
  const { result } = renderHook(() => useReplaceCasting(), { wrapper });

  const cast = [
    {
      character_id: "c1",
      role: "Main",
      position: 0,
      voices: [
        { person_id: "p1", person_name: "Voice A", remark: "" },
        { person_id: null, person_name: "typed but unresolved", remark: "child" },
        { person_id: "p2", person_name: "Voice B", remark: "ep 13-" },
      ],
    },
  ];

  result.current.mutate({ mediaType: "anime", entryId: "e1", cast });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const [, init] = fetch.mock.calls[0];
  expect(JSON.parse(init.body).cast[0].voices).toEqual([
    { person_id: "p1", remark: null },
    { person_id: "p2", remark: "ep 13-" },
  ]);
});

// The cast editor loads rows with the row's OWN photo (null when it has none)
// and the resolved display pair beside it. Saving must send the own photo only,
// so a row that was showing its character's face does not freeze it.
it("sends a loaded main row switched to an identity with no photo_file", async () => {
  const { result } = renderHook(() => useReplaceCasting(), { wrapper });

  const cast = [
    {
      system_id: "k1",
      character_id: "c1",
      identity_id: "i1",
      identity_name: "Conan",
      role: "Main",
      position: 0,
      photo_file: null,
      photo_focus: null,
      display_photo_file: "characters/shinichi.jpg",
      display_photo_focus: "10% 10%",
    },
  ];

  result.current.mutate({ mediaType: "anime", entryId: "e1", cast });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const sent = JSON.parse(fetch.mock.calls[0][1].body).cast[0];
  expect(sent.photo_file).toBeNull();
  expect(sent).not.toHaveProperty("display_photo_file");
  expect(sent).not.toHaveProperty("display_photo_focus");
  expect(sent.identity_id).toBe("i1");
});

it("sends identity_id null when blank and strips identity_name", async () => {
  const { result } = renderHook(() => useReplaceCasting(), { wrapper });

  const cast = [
    { character_id: "c1", identity_id: "", identity_name: "typed", position: 0 },
    { character_id: "c2", position: 1 },
  ];

  result.current.mutate({ mediaType: "anime", entryId: "e1", cast });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const sent = JSON.parse(fetch.mock.calls[0][1].body).cast;
  expect(sent.map((r) => r.identity_id)).toEqual([null, null]);
  for (const r of sent) expect(r).not.toHaveProperty("identity_name");
});
