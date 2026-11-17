// The book form must be able to write serialization_platform: the field is a
// TAG_FIELD on manga and book alike (app/utils/credit_roles.py) and the book
// response already exposes it. Mirrors manga exactly.
import { describe, expect, it } from "vitest";

import { TYPE_FIELD_META } from "./fieldMeta";
import { defaultBook } from "../formFactories";

describe("book serialization_platform", () => {
  it("has a fieldMeta descriptor drawn from the book-scoped vocabulary", () => {
    const meta = TYPE_FIELD_META.book.serialization_platform;
    expect(meta).toBeTruthy();
    expect(meta.control).toBe("tags");
    expect(meta.source).toEqual({
      kind: "option",
      category: "Serialization Platform",
      scope: "book",
    });
  });

  it("has a form default so the field is controlled from the first render", () => {
    expect(defaultBook()).toHaveProperty("serialization_platform", "");
  });
});
