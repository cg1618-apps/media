// A person's gallery of works: who may have one, and how a picture is drawn.
//
// Only an author or illustrator has works to show - the same pair the API
// checks before it takes an upload (app/services/domain/person_work_images.py,
// GALLERY_PERSON_ROLES). The pictures are library uploads, so their keys are
// `library/<checksum>.jpg` and resolve through getCoverUrl like any other.
import { getCoverUrl } from "./covers";

export const GALLERY_ROLES = ["author", "illustrator"];

/** Whether `roles` ([{role, scope}]) hold author or illustrator in any scope. */
export function holdsGalleryRole(roles) {
  return (roles || []).some((r) => GALLERY_ROLES.includes(r.role));
}

/** The full picture's URL, and its small version for a grid tile. */
export function workImageUrls(picture) {
  return {
    full: getCoverUrl(picture.storage_key),
    thumb: picture.thumb_key ? getCoverUrl(picture.thumb_key) : getCoverUrl(picture.storage_key),
  };
}
