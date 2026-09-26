// Frontend: no image field can be given a default on /defaults.
//
// An image is set through ImagePicker - upload, choose from the library, or
// remove - never by typing a storage key, and a default would stamp one
// picture onto every new record. So every cover, logo and photo field has to
// declare itself undefaultable with no control, or the registry falls back to
// a plain text input and puts the typed key back on the defaults page.
import { describe, expect, it } from "vitest";
import { FORM_FACTORIES } from "../formFactories";
import { getFieldRegistry } from "./index";

const IMAGE_FIELDS = new Set(["cover_image_file", "logo_file", "photo_file"]);

describe("image fields on /defaults", () => {
  const imageFields = Object.keys(FORM_FACTORIES).flatMap((type) =>
    getFieldRegistry(type)
      .filter((field) => IMAGE_FIELDS.has(field.key))
      .map((field) => ({ type, ...field })),
  );

  it("finds the image field of every media and entity type", () => {
    // Guards the check below against passing on an empty list.
    const types = imageFields.map((field) => field.type);
    for (const type of ["anime", "h-game", "person", "character", "publisher", "studio"]) {
      expect(types).toContain(type);
    }
  });

  it.each(imageFields.map((field) => [field.type, field.key, field]))(
    "%s %s takes no default and has no control",
    (_type, _key, field) => {
      expect(field.defaultable).toBe(false);
      expect(field.control).toBe("none");
    },
  );
});
