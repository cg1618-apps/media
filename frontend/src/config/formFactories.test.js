// Frontend: the Add form's starting values, per media type.
//
// A factory is the contract between /defaults, the Add page and the payload
// builder: a field missing here is a field the Add form cannot show and the
// defaults page cannot configure.
import { describe, expect, it } from "vitest";
import { FORM_FACTORIES, defaultAnime, defaultBook, defaultGame, defaultHGame } from "./formFactories";
import { getFieldMap } from "./formFields";

describe("defaultGame", () => {
  it("starts on Might Play with the play flags off", () => {
    const form = defaultGame();
    expect(form.playing_status).toBe("Might Play");
    expect(form.play_next).toBe(false);
    expect(form.to_replay).toBe(false);
    expect(form.copies).toEqual([]);
  });

  it("is registered under the game key", () => {
    expect(FORM_FACTORIES.game).toBe(defaultGame);
  });
});

describe("is_main on the game types", () => {
  // Games carry their own Main / Remake / Remaster vocabulary, not the shared
  // 本傳 / 外傳 one, and a new entry starts as the main game.
  it("starts a game and an h-game on Main", () => {
    expect(defaultGame().is_main).toBe("Main");
    expect(defaultHGame().is_main).toBe("Main");
  });

  it("leaves the shared vocabulary's default on the other types", () => {
    expect(defaultAnime().is_main).toBe("本傳");
  });
});

describe("defaultBook", () => {
  it("is registered under the book key", () => {
    expect(FORM_FACTORIES.book).toBe(defaultBook);
  });

  // Split by edition as anime's is; end_date stays one column.
  it("carries the JP and TW release dates and no plain release_date", () => {
    const form = defaultBook();
    expect(form.release_date_jp).toBe("");
    expect(form.release_date_tw).toBe("");
    expect(form.end_date).toBe("");
    expect("release_date" in form).toBe(false);
  });

  it("labels both dates as free text on /defaults", () => {
    const fields = getFieldMap("book");
    expect(fields.release_date_jp).toMatchObject({ label: "Release Date (JP)", control: "text" });
    expect(fields.release_date_tw).toMatchObject({ label: "Release Date (TW)", control: "text" });
  });
});
