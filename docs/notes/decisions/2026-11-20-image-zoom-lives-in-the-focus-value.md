# Image zoom lives in the focus value

Source images are often wide landscapes while most frames are tall 2:3 cards,
so aiming the crop is not always enough: the owner also needs to zoom in on
part of the picture, or out to see all of it. The zoom is stored in the same
`<x>_focus` column as the focal point, as an optional third token: `"X% Y%"`
(zoom 1), `"X% Y% Z"` (Z above 1, at most 4, at most two decimals) or
`"X% Y% fit"` (the whole image, letterboxed on plain bars).

- **In the focus string, not a column of its own.** A zoom means nothing
  without the point it zooms about, so the two always travel together. The
  focus columns, the reset rule (a focus belongs to the picture it was set
  on), the Sheets round trip and every API field already exist for one
  value, so extending its grammar needs no migration, no new Sheets column and
  no second field beside each of the seven image columns. Every existing
  `"X% Y%"` stays valid unchanged. There is one parse site on each side:
  `coerce_image_focus` on the server (which the Sheets Pull also uses) and
  `focusStyle` / `parseFocus` in `lib/covers.js` on the SPA.
- **Fit is a token, not a zoom below 1.** Whether a picture fills or fits a
  frame depends on the shapes of both: a landscape image fully zoomed out is
  letterboxed top and bottom in a card and in a square by different amounts.
  A single number below 1 cannot mean "show all of it" in a card and a square
  at once, because the factor that reaches the edge differs per frame. `fit`
  says what is meant and lets each frame work it out (`object-fit: contain`).
- **Zoom 1 is written by leaving the token out, and an explicit `1` is
  refused.** One canonical spelling per value keeps the stored data
  comparable, and keeps the centre at zoom 1 NULL as it always was. Fit is
  never NULL, since it differs from the default.
- **Zoom scales the image about the focal point** (`transform: scale(Z)` with
  `transform-origin` at X% Y%), which keeps the chosen point of the picture
  exactly where `object-position` put it. It is why every focused image has to
  sit in a frame that clips it, which `src/focus-images.test.js` checks.
- **Plain bars, not a blurred fill**, for fit: the owner chose plain, and the
  bars use the inset surface colour so they follow the theme.

Rejected:

- **A free crop rectangle.** One rectangle is cut for one frame shape; the
  same image is drawn in 2:3 cards, squares, 3:4 tiles and small thumbnails,
  and a rectangle that suits one is wrong for the others. A point and a zoom
  degrade sensibly into every shape.
- **A destructive crop on the server.** It throws away the original, so the
  choice can never be revisited, and a library file shared by two owners is
  aimed differently in each; cropping the file would force one owner's choice
  on the other.
