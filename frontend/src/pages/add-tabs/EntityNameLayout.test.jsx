// Frontend: every entity form - studio, publisher, person, character,
// identity - lays its four names out CN | EN, then JP | Alt. Add and Modify
// render the same <Entity>Fields, so one render per entity covers both.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFields } from "./StudioAddTab";
import { PublisherFields } from "./PublisherAddTab";
import { PersonFields } from "./PersonAddTab";
import { CharacterFields } from "./CharacterAddTab";
import { IdentityFields, defaultIdentity } from "./IdentityAddTab";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";

vi.mock("../../components/forms/ImagePicker", () => ({
  default: () => <div data-testid="image-picker" />,
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(node) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const noop = () => {};
const rowOf = (name) => screen.getByRole("textbox", { name }).closest(".grid");

const FORMS = [
  ["studio", () => <StudioFields studioForm={{}} usf={noop} />],
  ["publisher", () => <PublisherFields publisherForm={{}} upf={noop} />],
  [
    "person",
    () => <PersonFields personForm={{}} upf={noop} roles={[]} setRoles={noop} legalScopes={{}} />,
  ],
  ["character", () => <CharacterFields characterForm={{}} ucf={noop} />],
  ["identity", () => <IdentityFields form={defaultIdentity()} update={noop} />],
];

describe.each(FORMS)("the %s form's names", (_kind, form) => {
  it("are CN | EN on the first row and JP | Alt on the second", () => {
    mount(form());
    const names = screen
      .getAllByRole("textbox")
      .map((el) => el.getAttribute("aria-label"))
      .filter((label) => /^Name \(/.test(label || ""));
    expect(names).toEqual([
      "Name (Chinese)",
      "Name (English)",
      "Name (Japanese)",
      "Name (Alternative)",
    ]);
    expect(rowOf("Name (Chinese)")).toBe(rowOf("Name (English)"));
    expect(rowOf("Name (Japanese)")).toBe(rowOf("Name (Alternative)"));
    expect(rowOf("Name (Chinese)")).not.toBe(rowOf("Name (Japanese)"));
  });
});

it("leaves the display-name fallback order alone", () => {
  // The layout is the component's; the field list is the fallback chain.
  expect(STUDIO_NAME_FIELDS.map((f) => f.key)).toEqual(["en", "cn", "jp", "alt"]);
});
