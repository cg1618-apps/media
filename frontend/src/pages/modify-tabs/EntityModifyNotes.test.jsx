// Frontend: every entity's Modify editor - studio, publisher, person,
// character, identity - carries the entity's notes (remark list, personal
// notes, resources) under Structured Notes, outside the editor's <form>.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../hooks/useToast";
import StudioModifyTab from "./StudioModifyTab";
import PublisherModifyTab from "./PublisherModifyTab";
import PersonModifyTab from "./PersonModifyTab";
import CharacterModifyTab from "./CharacterModifyTab";
import IdentityModifyTab from "./IdentityModifyTab";

// NotesTemplate fetches on mount; here only which owner it is handed.
vi.mock("../notes/NotesTemplate", () => ({
  default: ({ ownerType, ownerId }) => (
    <div data-testid="entity-notes" data-owner-type={ownerType} data-owner-id={ownerId} />
  ),
}));
vi.mock("../../components/info/RelatedRecords", () => ({ default: () => null }));
vi.mock("../../components/forms/ImagePicker", () => ({
  default: () => <div data-testid="image-picker" />,
}));

const RECORD = {
  system_id: "x1",
  character_id: "c1",
  name_en: "Record X",
  display_name: "Record X",
  character_display_name: "Someone",
  roles: [],
  scopes: [],
  identities: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      let body = [];
      if (/\/x1$/.test(u)) body = RECORD;
      else if (u.startsWith("/api/character-identity/")) body = [RECORD];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(node) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe.each([
  ["studio", StudioModifyTab],
  ["publisher", PublisherModifyTab],
  ["person", PersonModifyTab],
  ["character", CharacterModifyTab],
  ["identity", IdentityModifyTab],
])("the %s editor", (ownerType, Tab) => {
  it("draws the entity's notes, outside its form", async () => {
    mount(<Tab initialId="x1" />);
    const notes = await screen.findByTestId("entity-notes");
    expect(notes).toHaveAttribute("data-owner-type", ownerType);
    expect(notes).toHaveAttribute("data-owner-id", "x1");
    expect(notes.closest("form")).toBeNull();
    expect(
      notes.closest(".rounded-2xl").querySelector('[data-form-section="Structured Notes"]'),
    ).not.toBeNull();
  });
});
