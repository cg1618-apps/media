# Genres and labels are replaced from a series or franchise entry

**Replace genres & labels from…** (`forms/TagReplace.jsx`) is offered wherever
an entry carries classification tags.

- **Replaced, not appended.** Picking a source overwrites each field with the
  source's value, clearing one the source has empty. The use is "tag this like
  that one", and a merge left old tags behind to remove by hand. Nothing is
  saved until the form is, and the wording says "Replace".
- **Series first, then the franchise**, split in the browser from the one
  franchise list, so there is no new endpoint.
- **Same media type only**: tags are scoped per type, so another type's values
  would not be offered by this form's pickers.
- **Genres and labels only.** A game's theme, mode, combat mode and platform
  describe its play rather than its kind, and are left out.
