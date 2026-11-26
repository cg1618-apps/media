// Frontend: where the entity forms place My Rating and their links. Add and
// Modify render the same <Entity>Fields, so one render per entity covers
// both pages.
//
// - studio: My Rating beside the Logo; publisher: beside Offered On;
//   person: beside Display Name; character: beside Gender.
// - person: every link in a Links section, none under Profile.
// - character: its links and photo under Links & Photos.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFields } from "./StudioAddTab";
import { PublisherFields } from "./PublisherAddTab";
import { PersonFields } from "./PersonAddTab";
import { CharacterFields } from "./CharacterAddTab";

vi.mock("../../components/forms/ImagePicker", () => ({
  default: () => <div data-testid="image-picker" />,
}));
const { viewer } = vi.hoisted(() => ({ viewer: { ownData: true } }));
vi.mock("../../hooks/useViewScope", () => ({
  useViewScope: () => ({ ownData: viewer.ownData }),
}));

beforeEach(() => {
  viewer.ownData = true;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(node) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
  return container;
}

const noop = () => {};
const rowOfLabel = (text) => screen.getByText(text, { selector: "label" }).closest(".grid");

// The section an element sits in: the last section header before it.
function sectionOf(container, el) {
  const headers = [...container.querySelectorAll("[data-form-section]")];
  const before = headers.filter(
    (h) => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  return before.at(-1)?.getAttribute("data-form-section") ?? null;
}
const sectionOfLabel = (container, text) =>
  sectionOf(container, screen.getByText(text, { selector: "label" }));

describe("My Rating's place", () => {
  it("studio: beside the Logo", () => {
    mount(<StudioFields studioForm={{}} usf={noop} />);
    expect(rowOfLabel("My Rating")).toBe(rowOfLabel("Logo"));
  });

  it("publisher: beside Offered On", () => {
    mount(<PublisherFields publisherForm={{}} upf={noop} />);
    expect(rowOfLabel("My Rating")).toBe(rowOfLabel("Offered On"));
  });

  it("person: beside Display Name", () => {
    mount(<PersonFields personForm={{}} upf={noop} roles={[]} setRoles={noop} legalScopes={{}} />);
    expect(rowOfLabel("My Rating")).toBe(rowOfLabel("Display Name"));
  });

  it("character: beside Gender", () => {
    mount(<CharacterFields characterForm={{}} ucf={noop} />);
    expect(rowOfLabel("My Rating")).toBe(rowOfLabel("Gender"));
  });

  it("is drawn once, and not at all for a viewer who keeps no list", () => {
    mount(<StudioFields studioForm={{}} usf={noop} />);
    expect(screen.getAllByText("My Rating", { selector: "label" })).toHaveLength(1);
    cleanup();
    viewer.ownData = false;
    mount(<CharacterFields characterForm={{}} ucf={noop} />);
    expect(screen.queryByText("My Rating", { selector: "label" })).toBeNull();
  });
});

describe("links sections", () => {
  it("person: every link sits under Links, not Profile", () => {
    const container = mount(
      <PersonFields personForm={{}} upf={noop} roles={[]} setRoles={noop} legalScopes={{}} />,
    );
    for (const label of [
      "MAL Link",
      "AniList Link",
      "IMDb Link",
      "Twitter Link",
      "Instagram Link",
      "pixiv Link",
    ]) {
      expect(sectionOfLabel(container, label)).toBe("Links");
    }
    expect(sectionOfLabel(container, "Gender")).toBe("Profile");
    expect(rowOfLabel("MAL Link").className).toContain("md:grid-cols-2");
  });

  it("character: its links and photo sit under Links & Photos", () => {
    const container = mount(<CharacterFields characterForm={{}} ucf={noop} />);
    for (const label of ["MAL Link", "AniList Link", "Photo"]) {
      expect(sectionOfLabel(container, label)).toBe("Links & Photos");
    }
    expect(sectionOfLabel(container, "Gender")).toBe("Profile");
  });
});
