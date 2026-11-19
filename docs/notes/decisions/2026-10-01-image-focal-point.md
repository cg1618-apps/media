# Images carry a focal point, stored beside each image column

Images are drawn with `object-cover` almost everywhere, and the crop keeps the
centre, so a portrait cover in a square frame loses the face. The focus is a
CSS `object-position` the SPA applies verbatim (`"X% Y%"`); NULL means centred.

- **One column per image column, not one per image file.** The focus is stored
  as `<x>_focus` beside each `<x>_file`. Rejected: columns on the `image`
  table, because most displayed images have no `image` row (a downloaded cover
  is only a file and its column; a cast photo has no attachment). Every
  displayed image comes from one owner column, so that is where its focus
  goes. A file shared by two owners can be aimed differently in each, which is
  right: the frames differ too.
- **A focus belongs to the picture it was set on.** Changing an owner's image
  key resets it; re-attaching the same key keeps it. Autofill and cover
  re-download do not reset, because they only fill an empty key or re-fetch
  the same picture.
- **Quote and meme images have no focus**, because they are drawn uncropped.
- **"focus", not "position"**: `image_attachment.position` already means
  ordering within an owner's images.
- **Group covers borrow the entry's focus**, so the resolvers in `lib/covers.js`
  return `{ url, focus }`.
- **A guard instead of a checklist.** `src/focus-images.test.js` fails the build
  on any cropped `<img>` that neither sets a `style` nor opts out with
  `data-focus="none"`; the next cropped image added anywhere is the one a list
  would miss.
