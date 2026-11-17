// Frontend: a watch-type entry's minutes are its "Runtime", never "Length".
//
// Movie columns stay `length_min`; only what a reader sees is worded as
// runtime. The per-episode column is `runtime_min` on anime, TV and cartoon.
import { COMMON_FIELD_META, TYPE_FIELD_META } from "./fieldMeta";

test("a movie's minutes are labelled Runtime", () => {
  expect(COMMON_FIELD_META.length_min.label).toBe("Runtime (min)");
});

test("a cartoon's per-episode minutes are labelled Runtime", () => {
  expect(TYPE_FIELD_META.cartoon.runtime_min.label).toBe("Episode Runtime (min)");
});

test("anime and TV show runtimes are labelled Runtime", () => {
  expect(TYPE_FIELD_META.anime.runtime_min.label).toBe("Runtime (min)");
  expect(TYPE_FIELD_META["tv-show"].runtime_min.label).toBe("Runtime (min)");
});

test("no field label still says Length", () => {
  const labels = [
    ...Object.values(COMMON_FIELD_META),
    ...Object.values(TYPE_FIELD_META).flatMap((meta) => Object.values(meta)),
  ]
    .map((meta) => meta?.label)
    .filter(Boolean);
  expect(labels.filter((label) => /\bLength\b/.test(label))).toEqual([]);
});
