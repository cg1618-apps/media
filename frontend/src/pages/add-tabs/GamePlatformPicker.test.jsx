// Frontend: the Game form's Platform picker adds a console's family as the
// console is picked, and keeps the main platforms first, as the server does on
// every write.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { GameFormBody } from "./GameAddTab";
import { defaultGame } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => false }),
}));

const platform = (value, family = null) => ({
  system_id: value,
  category: "Game Platform",
  value,
  scopes: ["game"],
  family,
});

const SOURCES = {
  options: [
    platform("Nintendo"),
    platform("Switch", "Nintendo"),
    platform("PlayStation"),
    platform("PS5", "PlayStation"),
  ],
  studios: [],
  people: {},
};

function Harness({ initial }) {
  const [f, setF] = useState({ ...defaultGame(), game_platform: initial });
  return (
    <GameFormBody
      f={f}
      u={(key, value) => setF((prev) => ({ ...prev, [key]: value }))}
      allGames={[]}
      sources={SOURCES}
    />
  );
}

function renderPicker(initial = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

// The Platform field: Field's <label>, then MultiSelect, whose pill box holds
// one <span> per tag beside the combobox.
function platformBox() {
  const label = screen.getAllByText("Platform").find((el) => el.tagName === "LABEL");
  return within(label.parentElement).getByRole("combobox").parentElement;
}

function platformTags() {
  return [...platformBox().children]
    .filter((el) => el.tagName === "SPAN")
    .map((el) => el.textContent.trim());
}

function removeTag(value) {
  const pill = [...platformBox().children].find(
    (el) => el.tagName === "SPAN" && el.textContent.trim() === value,
  );
  return within(pill).getByRole("button");
}

describe("the Platform picker", () => {
  it("picks Nintendo when Switch is picked", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(within(platformBox()).getByRole("combobox"), "Switch{Enter}");
    expect(platformTags()).toEqual(["Nintendo", "Switch"]);
  });

  it("keeps Nintendo while Switch stays picked", async () => {
    const user = userEvent.setup();
    renderPicker("Nintendo, Switch, PlayStation");
    await user.click(removeTag("Nintendo"));
    // Back, and ahead of the console: main platforms come first.
    expect(platformTags()).toEqual(["PlayStation", "Nintendo", "Switch"]);
  });

  it("keeps the main platforms ahead of every console", async () => {
    const user = userEvent.setup();
    renderPicker("Nintendo, Switch");
    await user.type(within(platformBox()).getByRole("combobox"), "PS5{Enter}");
    expect(platformTags()).toEqual(["PlayStation", "Nintendo", "Switch", "PS5"]);
  });

  it("lets a family go once no console holds it", async () => {
    const user = userEvent.setup();
    renderPicker("PlayStation, Nintendo");
    await user.click(removeTag("PlayStation"));
    expect(platformTags()).toEqual(["Nintendo"]);
  });
});
