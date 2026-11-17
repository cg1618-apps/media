// Frontend: a watch-type entry's minutes are its "Runtime", never "Length".
//
// The columns stay `length_min` / `length_ep_min`; only what a reader sees is
// worded as runtime.
import { COMMON_FIELD_META, TYPE_FIELD_META } from "./fieldMeta";

test("a movie's minutes are labelled Runtime", () => {
  expect(COMMON_FIELD_META.length_min.label).toBe("Runtime (min)");
});

test("a cartoon's per-episode minutes are labelled Runtime", () => {
  expect(TYPE_FIELD_META.cartoon.length_ep_min.label).toBe("Episode Runtime (min)");
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
