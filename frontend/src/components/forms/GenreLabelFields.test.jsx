// Frontend: the Genre Main / Genre Sub / 標籤 Label section the seven
// non-anime types share. The scope is the point: a value scoped to manga must
// not be offered on a movie, while an unscoped one is offered on both.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GenreLabelFields from "./GenreLabelFields";

const SOURCES = {
  options: [
    { system_id: "o1", category: "Genre Main", value: "Shounen", scopes: ["manga"] },
    { system_id: "o2", category: "Genre Main", value: "Action", scopes: [] },
    { system_id: "o3", category: "Genre Sub", value: "Isekai", scopes: [] },
    { system_id: "o4", category: "Label", value: "必看", scopes: [] },
  ],
};

const BLANK = { genre_main: "", genre_sub: "", label: "" };

function renderFields(mediaType, onChange = vi.fn()) {
  render(
    <GenreLabelFields
      mediaType={mediaType}
      values={BLANK}
      onChange={onChange}
      sources={SOURCES}
    />,
  );
  return onChange;
}

// The three pickers render in GENRE_LABEL_FIELDS order.
async function openPicker(index) {
  await userEvent.click(screen.getAllByRole("combobox")[index]);
  return screen.getAllByRole("option").map((o) => o.textContent);
}

describe("GenreLabelFields", () => {
  it("renders the three pickers under their labels", () => {
    renderFields("movie");
    expect(screen.getByText("Genre Main")).toBeInTheDocument();
    expect(screen.getByText("Genre Sub")).toBeInTheDocument();
    expect(screen.getByText("標籤 Label")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
  });

  it("offers a manga-scoped genre on manga, alongside an unscoped one", async () => {
    renderFields("manga");
    const offered = await openPicker(0);
    expect(offered).toContain("Shounen");
    expect(offered).toContain("Action");
  });

  it("does not offer a manga-scoped genre on a movie", async () => {
    renderFields("movie");
    const offered = await openPicker(0);
    expect(offered).toContain("Action");
    expect(offered).not.toContain("Shounen");
  });

  it("keeps each picker to its own category", async () => {
    renderFields("manga");
    const offered = await openPicker(2);
    expect(offered).toContain("必看");
    expect(offered).not.toContain("Action");
    expect(offered).not.toContain("Isekai");
  });

  it("reports a pick under the field's form key", async () => {
    const onChange = renderFields("novel");
    await openPicker(1);
    await userEvent.click(screen.getByRole("option", { name: "Isekai" }));
    expect(onChange).toHaveBeenLastCalledWith("genre_sub", "Isekai");
  });
});
