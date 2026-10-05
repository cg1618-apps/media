# Manga chapter comments, and grouped Resources — design

Working scaffolding: delete this file in the commit that finishes the work,
after moving what is worth keeping into `docs/systems/notes.md` and
`docs/systems/resources.md`.

**Status: design approved, open questions answered (see bottom). Nothing
implemented yet — next step is implementation, tests first.**

## Request (owner's words)

> I want to add ch review note for manga. It should be the same as ep review
> for anime. In addition, for resources, I want to add a optional group field.
> It should be applied to all group and media types. We will group each
> resources by the group.

## What exists

- "Ep review" is the `episode_comments` section (各集評論 Episode Comments) in
  `app/utils/note_sections.py`, owners `anime`, `tv-show`, `cartoon`, `game`.
  Game already reuses it with a per-owner label (各章評論 Part Reviews) and
  locator placeholder.
- Resources is the `resources` section: shape `name_links` (title + links),
  owners `ALL_OWNERS` (nine media types + collection, franchise, series),
  `standalone=True`, catalog scope. It is the only `name_links` section.
  Frontend: `frontend/src/pages/notes/sections/NameLinksSection.jsx`.

## Design

### 1. Manga chapter comments

Add `manga` to `episode_comments.owners`, with per-owner overrides exactly
like game's:

- `labels["manga"] = "各話評論 Chapter Comments"`
- `locator_placeholders["manga"] = "Chapter, e.g. ch 1"`

Same section, so same behaviour: personal scope, locator required, takes
links, lives in the 評論 card. No migration.

### 2. Optional group on Resources

- **Storage:** `note.kind`, which `name_links` does not use. No migration, and
  the Google Sheets Note tab already carries `kind`, so no sheet reshape.
- **Registry:** a new `NoteSection` flag (working name `kind_is_group: bool`),
  set only on `resources`. It makes `kind` free text. `app/schemas/note.py`
  currently refuses any `kind` on a section with no `kinds`/`kind_category`
  ("takes no kind"), so the flag relaxes that check. A group alone does not
  make a row non-empty. Expose the flag in the section response schema.
- **Editing:** an optional "Group" input in `NameLinksSection.jsx`, suggesting
  (datalist) the group names already used in this owner's Resources.
- **Read view:** one heading per group, groups in the order each first appears
  in the row order; ungrouped rows **last**, under an "Other" heading.
  Reordering is unchanged.
- Applies to all twelve owner types automatically — one section.

### Tests (write failing first)

- Backend: manga accepted on `episode_comments` with its label/placeholder; a
  `kind` accepted on `resources`; a `kind` still refused on a section without
  the flag (the refusal test must target a section that genuinely has no
  kinds); a group alone is still an empty row.
- Frontend (vitest): grouped rendering, and the group input.

### Docs

`docs/systems/notes.md`, `docs/systems/resources.md`, bump `Last verified`.

## Decisions (owner)

1. Ungrouped resources go **last**, under an "Other" heading.
2. The manga label is `各話評論 Chapter Comments`.
