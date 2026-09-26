// The one editor behind every media type's Sources block. Guards the three
// things the eight copy-pasted editors used to get subtly wrong: rows are
// identified by index not by name, a blank name is dropped on save, and the
// bucket is explicit rather than implied.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SourcesEditor from "./SourcesEditor";

const sources = {
  options: [
    { category: "Platform", value: "Netflix", scopes: [], usages: [] },
    { category: "Platform", value: "Fox", scopes: [], usages: ["origin"] },
    {
      category: "Reference Source",
      value: "Official Site",
      scopes: [],
      usages: [],
    },
  ],
};

function renderEditor(value = [], onChange = vi.fn()) {
  render(
    <SourcesEditor
      value={value}
      onChange={onChange}
      mediaType="anime"
      sources={sources}
    />,
  );
  return onChange;
}

describe("SourcesEditor", () => {
  it("adds a free-form row to the other bucket", () => {
    const onChange = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /add other source/i }));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "access", bucket: "other", name: "", url: "", available: null },
    ]);
  });

  it("adds a row to the restricted bucket separately", () => {
    const onChange = renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: /add restricted source/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        kind: "access",
        bucket: "restricted",
        name: "",
        url: "",
        available: null,
      },
    ]);
  });

  it("removes the row at the clicked index, not the first with that name", () => {
    const rows = [
      { kind: "access", bucket: "other", name: "Same", url: "a" },
      { kind: "access", bucket: "other", name: "Same", url: "b" },
    ];
    const onChange = renderEditor(rows);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    expect(onChange).toHaveBeenCalledWith([rows[0]]);
  });

  it("does not offer an origin-only platform as a watch source", () => {
    renderEditor([
      { kind: "access", bucket: "main", name: "", url: "", available: null },
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Netflix");
    expect(options).not.toContain("Fox");
  });

  it("adds a reference row with no availability and no free-form bucket", () => {
    const onChange = renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: /add reference source/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        kind: "reference",
        bucket: "main",
        name: "",
        url: "",
        available: null,
      },
    ]);
  });

  it("offers Reference Source values but not Platform values in the reference dropdown", () => {
    renderEditor([
      {
        kind: "reference",
        bucket: "main",
        name: "",
        url: "",
        available: null,
      },
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Official Site");
    expect(options).not.toContain("Netflix");
  });

  it("drops the access group entirely when the media type has no access sources", () => {
    // A game is played on a platform, not watched on one - and the unscoped
    // Platform values would otherwise still be offered.
    render(
      <SourcesEditor
        value={[]}
        onChange={vi.fn()}
        mediaType="game"
        sources={sources}
        showAccess={false}
      />,
    );
    expect(screen.queryByText(/main sources/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add main source/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add reference source/i }),
    ).toBeInTheDocument();
  });

  it("keeps a reference row and an access row with the same name from colliding", () => {
    const rows = [
      { kind: "access", bucket: "main", name: "Netflix", url: "", available: null },
      { kind: "reference", bucket: "main", name: "Netflix", url: "", available: null },
    ];
    const onChange = renderEditor(rows);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    expect(onChange).toHaveBeenCalledWith([rows[0]]);
  });

  describe("restricted suggestions", () => {
    const row = (name, url = "") => ({
      kind: "access",
      bucket: "restricted",
      name,
      url,
      available: null,
    });

    function renderWith(value, onChange = vi.fn()) {
      render(
        <SourcesEditor
          value={value}
          onChange={onChange}
          mediaType="h-comic"
          sources={sources}
          restrictedSources={{ prefill: ["禁漫天堂", "ToonGod"], suggestions: ["禁漫天堂", "ToonGod"] }}
        />,
      );
      return onChange;
    }

    it("prefills only the suggested names the bucket does not hold", () => {
      // The other bucket holds ToonGod too; only a restricted row counts.
      const other = { ...row("ToonGod"), bucket: "other" };
      const onChange = renderWith([row("禁漫天堂", "https://x.test"), other]);
      fireEvent.click(screen.getByRole("button", { name: /prefill suggested \(1\)/i }));
      expect(onChange).toHaveBeenCalledWith([
        row("禁漫天堂", "https://x.test"),
        other,
        row("ToonGod"),
      ]);
    });

    it("offers no prefill once every suggestion is there", () => {
      renderWith([row("禁漫天堂"), row("ToonGod")]);
      expect(screen.queryByRole("button", { name: /prefill suggested/i })).toBeNull();
    });

    it("offers the suggestions while typing, and keeps a name outside them", () => {
      const onChange = renderWith([row("")]);
      const input = screen.getByRole("combobox", { name: "Restricted Sources name" });
      const list = document.getElementById(input.getAttribute("list"));
      expect([...list.options].map((o) => o.value)).toEqual(["禁漫天堂", "ToonGod"]);
      fireEvent.change(input, { target: { value: "Somewhere else" } });
      expect(onChange).toHaveBeenCalledWith([row("Somewhere else")]);
    });

    it("prefills only the every-entry names, and offers the optional ones too", () => {
      // Manga: three names every entry has, 包子漫畫 only offered. The bucket
      // holds none of them, so a prefill that took every suggestion would
      // add four rows here, not three.
      const onChange = vi.fn();
      render(
        <SourcesEditor
          value={[row("")]}
          onChange={onChange}
          mediaType="manga"
          sources={sources}
        />,
      );
      const input = screen.getByRole("combobox", { name: "Restricted Sources name" });
      const list = document.getElementById(input.getAttribute("list"));
      expect([...list.options].map((o) => o.value)).toEqual([
        "漫畫櫃 (電腦版)",
        "漫畫櫃 (手機版)",
        "漫畫人",
        "包子漫畫",
      ]);
      fireEvent.click(screen.getByRole("button", { name: /prefill suggested \(3\)/i }));
      expect(onChange).toHaveBeenCalledWith([
        row(""),
        row("漫畫櫃 (電腦版)"),
        row("漫畫櫃 (手機版)"),
        row("漫畫人"),
      ]);
    });

    it("offers the names but no prefill when every one is optional", () => {
      render(
        <SourcesEditor value={[row("")]} onChange={vi.fn()} mediaType="novel" sources={sources} />,
      );
      expect(screen.queryByRole("button", { name: /prefill suggested/i })).toBeNull();
      expect(
        screen.getByRole("combobox", { name: "Restricted Sources name" }),
      ).toHaveAttribute("list");
    });

    it("offers neither on a type with no list", () => {
      render(
        <SourcesEditor value={[row("")]} onChange={vi.fn()} mediaType="game" sources={sources} />,
      );
      expect(screen.queryByRole("button", { name: /prefill suggested/i })).toBeNull();
      expect(
        screen.getByRole("textbox", { name: "Restricted Sources name" }),
      ).not.toHaveAttribute("list");
    });
  });
});
