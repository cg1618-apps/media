// The person's types and scopes, and every tier's and entity's own My Rating,
// take a default on /defaults like any other Add-form field.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import DefaultsTab from "./DefaultsTab";
import { resolveDefaults } from "../../hooks/useFormDefaults";

const noop = () => {};

function renderTab(type, { defaults = {}, setFieldDefault = noop } = {}) {
  const queryClient = new QueryClient();
  // The role matrix draws only the types the server offers.
  queryClient.setQueryData(["person-role-scopes"], {
    director: ["anime", "movie"],
    author: ["manga", "book"],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DefaultsTab
        type={type}
        draft={{ defaults, autofill: [], restricted_prefill: null }}
        setFieldDefault={setFieldDefault}
        clearFieldDefault={noop}
        toggleAutofill={noop}
        setGroupAutofill={noop}
        setPrefill={noop}
        clearPrefill={noop}
        sources={{ options: [], studios: [], people: {} }}
      />
    </QueryClientProvider>,
  );
}

describe("/defaults for tiers and entities", () => {
  it.each(["collection", "franchise", "series", "studio", "publisher", "person", "character"])(
    "offers a My Rating default on the %s tab",
    (type) => {
      renderTab(type);
      expect(screen.getByText("My Rating")).toBeInTheDocument();
      expect(screen.getByText("my_rating")).toBeInTheDocument();
    },
  );

  // The viewer's own rating is never copied from another record.
  it.each(["franchise", "person"])("gives My Rating no auto-fill tick on the %s tab", (type) => {
    renderTab(type);
    expect(
      screen.queryByRole("checkbox", { name: "Replace My Rating when choosing an existing entry" }),
    ).toBeNull();
  });

  it("edits the person's types and scopes with the form's own matrix", () => {
    const setFieldDefault = vi.fn();
    renderTab("person", { setFieldDefault });
    expect(screen.getByText("Types & Scopes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Director/ }));
    expect(setFieldDefault).toHaveBeenCalledWith("roles", [
      { role: "director", scope: null },
    ]);
  });

  it("shows a configured default's scopes", () => {
    renderTab("person", {
      defaults: { roles: [{ role: "author", scope: "book" }] },
    });
    expect(screen.getByRole("checkbox", { name: /Author/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Director/ })).not.toBeChecked();
  });
});

describe("resolveDefaults for the new fields", () => {
  it("starts a person on the configured roles and rating", () => {
    const form = resolveDefaults("person", {
      person: {
        defaults: {
          roles: [{ role: "author", scope: "book", system_id: "x" }],
          my_rating: "A",
        },
      },
    });
    // A stored row is a template: no system_id rides along.
    expect(form.roles).toEqual([{ role: "author", scope: "book" }]);
    expect(form.my_rating).toBe("A");
  });

  it("starts with no roles and no rating when nothing is configured", () => {
    const form = resolveDefaults("person", {});
    expect(form.roles).toEqual([]);
    expect(form.my_rating).toBe("");
  });
});
