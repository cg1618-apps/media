// The one editor behind every media type's Sources block. Guards the three
// things the eight copy-pasted editors used to get subtly wrong: rows are
// identified by index not by name, a blank name is dropped on save, and the
// bucket is explicit rather than implied.
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SourcesEditor, { RestrictedPrefillEditor } from "./SourcesEditor";
import { RestrictedPrefillProvider } from "../../contexts/RestrictedPrefillContext";

// What a free-text name input suggests: focus opens its list, which is
// portaled out of the editor, then blur closes it again.
function offered(input) {
  fireEvent.focus(input);
  const list = screen.queryByRole("listbox");
  const names = list ? within(list).getAllByRole("option").map((o) => o.textContent) : [];
  fireEvent.blur(input);
  return names;
}

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
      expect(offered(input)).toEqual(["禁漫天堂", "ToonGod"]);
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
      expect(offered(input)).toEqual([
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
      expect(offered(screen.getByRole("combobox", { name: "Restricted Sources name" }))).not.toEqual(
        [],
      );
    });

    it("prefills the names picked on /defaults, not the built-in ones", () => {
      // Built-in manga prefills three names; the pick narrows it to 包子漫畫,
      // so a button still reading the built-ins would count 3.
      const onChange = vi.fn();
      render(
        <RestrictedPrefillProvider config={{ manga: { restricted_prefill: { all: ["包子漫畫"] } } }}>
          <SourcesEditor value={[]} onChange={onChange} mediaType="manga" sources={sources} />
        </RestrictedPrefillProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: /prefill suggested \(1\)/i }));
      expect(onChange).toHaveBeenCalledWith([row("包子漫畫")]);
    });

    it("leaves the restricted group out when asked to", () => {
      render(
        <SourcesEditor
          value={[row("Gimy")]}
          onChange={vi.fn()}
          mediaType="anime"
          sources={sources}
          showRestricted={false}
        />,
      );
      expect(screen.queryByText("Restricted Sources")).toBeNull();
    });

    it("offers neither on a type with no list", () => {
      render(
        <SourcesEditor value={[row("")]} onChange={vi.fn()} mediaType="game" sources={sources} />,
      );
      expect(screen.queryByRole("button", { name: /prefill suggested/i })).toBeNull();
      expect(offered(screen.getByRole("combobox", { name: "Restricted Sources name" }))).toEqual([]);
    });
  });
});

describe("RestrictedPrefillEditor", () => {
  const KR = ["禁漫天堂", "污汙漫畫", "ToonGod"];

  function renderPrefill(value, onChange = vi.fn()) {
    render(
      <RestrictedPrefillEditor
        label="Prefilled restricted sources"
        value={value}
        onChange={onChange}
        names={KR}
      />,
    );
    return onChange;
  }

  it("offers every available name while typing", () => {
    renderPrefill([""]);
    const input = screen.getByRole("combobox", { name: "Prefilled restricted sources name" });
    expect(offered(input)).toEqual(KR);
  });

  it("edits a list of names", () => {
    const onChange = renderPrefill(["禁漫天堂", ""]);
    const inputs = screen.getAllByRole("combobox", { name: "Prefilled restricted sources name" });
    fireEvent.change(inputs[1], { target: { value: "ToonGod" } });
    expect(onChange).toHaveBeenCalledWith(["禁漫天堂", "ToonGod"]);
  });

  it("adds the available names it does not hold yet", () => {
    const onChange = renderPrefill(["ToonGod"]);
    fireEvent.click(screen.getByRole("button", { name: /prefill suggested \(2\)/i }));
    expect(onChange).toHaveBeenCalledWith(["ToonGod", "禁漫天堂", "污汙漫畫"]);
  });

  it("removes a name", () => {
    const onChange = renderPrefill(["禁漫天堂", "ToonGod"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove source" })[0]);
    expect(onChange).toHaveBeenCalledWith(["ToonGod"]);
  });
});
