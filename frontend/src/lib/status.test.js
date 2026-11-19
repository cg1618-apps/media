// Frontend: unit tests for the three-way card status dispatcher.
/**
 * getCardStatusConfig() picks a button vocabulary from the media type. It is
 * the one place that knows watching, reading and playing are three separate
 * status axes rather than a read-or-watch binary.
 */

import { describe, expect, it } from "vitest";
import { getCardStatusConfig, getPlayingButtonConfig, statusToggleFields } from "./status";

describe("getCardStatusConfig", () => {
  it("is three-way, not read-or-watch", () => {
    expect(getCardStatusConfig("game", "Active Playing")).toEqual(
      getPlayingButtonConfig("Active Playing"),
    );
    // `target` is the status a click cycles to, and it is the field that
    // actually differs between the three vocabularies.
    expect(getCardStatusConfig("manga", "Active Reading").target).not.toBe(
      getPlayingButtonConfig("Active Playing").target,
    );
    expect(getCardStatusConfig("anime", "Active Watching").target).not.toBe(
      getPlayingButtonConfig("Active Playing").target,
    );
  });

  it("gives Play Anytime its own config rather than the fallback", () => {
    expect(getPlayingButtonConfig("Play Anytime")).not.toEqual(
      getPlayingButtonConfig("Might Play"),
    );
  });

  it("falls back to Might Play for an unknown playing status", () => {
    expect(getPlayingButtonConfig("nonsense")).toEqual(
      getPlayingButtonConfig("Might Play"),
    );
  });
});

describe("statusToggleFields", () => {
  it("zeroes every finished count when the toggle moves a row off Completed", () => {
    expect(statusToggleFields("manga", "reading_status", "Completed", "Might Read")).toEqual({
      reading_status: "Might Read",
      vol_fin: 0,
      vol_fin_page: 0,
      ch_fin: 0,
    });
    expect(
      statusToggleFields("anime", "watching_status", "Completed (解說)", "Might Watch"),
    ).toEqual({ watching_status: "Might Watch", ep_fin: 0 });
    expect(statusToggleFields("book", "reading_status", "Completed", "Might Read")).toEqual({
      reading_status: "Might Read",
      vol_fin: 0,
      arc_fin: 0,
      ch_fin: 0,
      ch_fin_in_arc: 0,
    });
    expect(statusToggleFields("h-comic", "reading_status", "Completed", "Might Read")).toEqual({
      reading_status: "Might Read",
      page_fin: 0,
      ch_fin: 0,
    });
  });

  it("leaves the counts alone on any other move", () => {
    // The mirror of the case above, on the same type: not leaving Completed.
    expect(statusToggleFields("manga", "reading_status", "Active Reading", "Might Read")).toEqual({
      reading_status: "Might Read",
    });
    expect(statusToggleFields("manga", "reading_status", "Might Read", "Plan to Read")).toEqual({
      reading_status: "Plan to Read",
    });
  });

  it("has nothing to zero on a type without a count", () => {
    expect(statusToggleFields("movie", "watching_status", "Completed", "Might Watch")).toEqual({
      watching_status: "Might Watch",
    });
    expect(statusToggleFields("game", "playing_status", "Completed", "Might Play")).toEqual({
      playing_status: "Might Play",
    });
  });
});
