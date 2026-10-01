// Frontend: the admin toolbar's release button on a detail page.
//
// One button, worded per media type, that moves an entry one step along its
// release axis. Types that run over time take two steps (Not Yet Aired ->
// Airing -> Finished Airing; 未出 -> 連載中 -> 完結); types released all at
// once take one (Not Yet Aired -> Finished Airing; Unreleased -> Released).
// `releaseAction` returns null whenever there is no next step - already
// released, cancelled, on hiatus, or no status recorded at all - and the
// page then renders no button.
//
// Games deliberately skip `Ongoing`: a live-service title is released, and
// it is not a step on the way to anything.
//
// The release step (`ask: true`) also asks for the details that go with a
// release - the release date columns, and on anime the broadcast slot and my
// watch day - but only the ones still empty, and every one is optional.
// `releaseDetailFields` lists them; an empty list means no dialog.
import { RELEASE_PRIORITY } from "./releaseDate";

const AIR_PENDING = ["Not Yet Aired", "Rumored"];

const SERIALIZING = ["連載中", "連載中 (不穩定)", "連載中 (有生之年)"];

const GAME_PENDING = ["Rumored", "Unreleased", "Early Access"];

function step(field, label, value, toast, ask = false) {
  return { label, payload: { [field]: value }, toast, ask };
}

function airing(entry, { oneShot }) {
  const status = entry.airing_status;
  if (AIR_PENDING.includes(status)) {
    return oneShot
      ? step("airing_status", "Mark released", "Finished Airing", "Marked as released", true)
      : step("airing_status", "Mark airing", "Airing", "Marked as airing", true);
  }
  if (status === "Airing" && !oneShot) {
    return step(
      "airing_status",
      "Mark finished airing",
      "Finished Airing",
      "Marked as finished airing",
    );
  }
  return null;
}

function serialization(entry, { pending }) {
  const status = entry.serialization_status;
  if (pending && status === pending) {
    return step(
      "serialization_status",
      "Mark serializing",
      "連載中",
      "Marked as serializing",
      true,
    );
  }
  if (SERIALIZING.includes(status)) {
    return step(
      "serialization_status",
      "Mark finished serializing",
      "完結",
      "Marked as finished serializing",
    );
  }
  return null;
}

function game(entry) {
  if (!GAME_PENDING.includes(entry.release_status)) return null;
  return step("release_status", "Mark released", "Released", "Marked as released", true);
}

// `type` is the data-layer key the pages pass to endpoints.resource().
export function releaseAction(type, entry) {
  if (!entry) return null;
  switch (type) {
    case "anime":
    case "cartoon":
      return airing(entry, { oneShot: entry.airing_type === "Movie" });
    case "tv-show":
    case "hentai":
      return airing(entry, { oneShot: false });
    case "anime-movie":
    case "movie":
      return airing(entry, { oneShot: true });
    case "manga":
    case "comic":
    case "h-comic":
      // MANGA_SERIALIZATION_STATUSES has no not-yet-released value.
      return serialization(entry, { pending: null });
    case "novel":
      return serialization(entry, { pending: "未出" });
    case "game":
    case "h-game":
      return game(entry);
    default:
      return null;
  }
}

const DATE_LABELS = {
  release_date: "Release date",
  release_date_jp: "Release date (JP)",
  release_date_tw: "Release date (TW)",
  release_date_usa: "Release date (USA)",
};

// Anime is the only type with a broadcast slot. A movie-format anime has no
// weekly slot, so it is asked for the date alone.
const ANIME_SCHEDULE = [
  { field: "broadcast_day", label: "Broadcast day", kind: "day" },
  { field: "broadcast_time", label: "Broadcast time", kind: "time" },
  { field: "my_watch_day", label: "My watch day", kind: "day" },
];

// The empty fields the release dialog offers, in display order.
export function releaseDetailFields(type, entry) {
  if (!entry) return [];
  const fields = (RELEASE_PRIORITY[type] || []).map((field) => ({
    field,
    label: DATE_LABELS[field],
    kind: "date",
  }));
  if (type === "anime" && entry.airing_type !== "Movie") {
    fields.push(...ANIME_SCHEDULE);
  }
  return fields.filter(({ field }) => entry[field] == null || entry[field] === "");
}
