// Frontend: the notes panel the Add page shows for the entry it just created.
//
// Notes hang off an entry's system_id, so the Add form cannot hold them before
// the entry exists. Once it does, this panel is the notes page for that entry:
// every section the owner type has, remark included - the Add form has
// already reset to a blank entry, so its Remark field no longer edits this row.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AddedEntryNotes from "./AddedEntryNotes";
import * as api from "../notes/api";

vi.mock("../notes/api");
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const SECTIONS = [
  { key: "remark", shape: "text", label: "Remark", kinds: [], singleton: true },
  { key: "overview", shape: "text", label: "Overview", kinds: [] },
];

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue([]);
});

function renderPanel(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AddedEntryNotes
        ownerType="hentai"
        entry={{ system_id: "e1" }}
        name="New Hentai"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("AddedEntryNotes", () => {
  it("loads the notes of the created entry, by its owner type and id", async () => {
    renderPanel();
    await waitFor(() => expect(api.fetchNotes).toHaveBeenCalledWith("hentai", "e1"));
    expect(api.fetchSections).toHaveBeenCalledWith("hentai");
    expect(screen.getByText("Notes for New Hentai")).toBeInTheDocument();
  });

  // A new entry has no notes yet, so the Notes card starts collapsed, as it
  // does for any empty entry on Modify; opening it lists every section.
  it("lists every section, remark included", async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Notes"));
    await waitFor(() => expect(screen.getByText("Overview")).toBeInTheDocument());
    expect(screen.getByText("Remark")).toBeInTheDocument();
  });
});
