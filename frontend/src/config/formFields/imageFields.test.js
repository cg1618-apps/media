// Frontend: no image field can be given a default on /defaults.
//
// An image is set through ImagePicker - upload, choose from the library, or
// remove - never by typing a storage key, and a default would stamp one
// picture onto every new record. So every cover, logo and photo field has to
// declare itself undefaultable with no control, or the registry falls back to
// a plain text input and puts the typed key back on the defaults page. The
// same holds for each image's focal point (cover_image_focus, logo_focus,
// photo_focus): it is set by FocusPicker on the picture it belongs to.
import { describe, expect, it } from "vitest";
import { FORM_FACTORIES } from "../formFactories";
import { getFieldRegistry } from "./index";

const IMAGE_FIELDS = new Set([
  "cover_image_file",
  "logo_file",
  "photo_file",
  "cover_image_focus",
  "logo_focus",
  "photo_focus",
]);

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

  it("finds a focus field beside every image field", () => {
    const keys = new Set(imageFields.map((f) => `${f.type}:${f.key}`));
    for (const f of imageFields.filter((x) => x.key.endsWith("_file"))) {
      expect(keys).toContain(`${f.type}:${f.key.replace(/_file$/, "_focus")}`);
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
