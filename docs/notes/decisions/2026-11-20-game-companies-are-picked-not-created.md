# A game's developer and publisher are picked, not created

A game's developer (a `studio` row) and publisher (a `publisher` row) name a
company that already exists. The Game form's Developer and Publisher fields
offer no add row, the Add and Modify saves refuse a name matching no row
before anything is written, `PUT /api/credits/game/...` refuses it with a 422,
and the IGDB fill credits only companies already on file, logging the rest. A
company is made from its own Studio or Publisher tab, where its names, logo,
country and founding date are entered together.

## Why

Find-or-create is right for a vocabulary value, and wrong for a company. A
name that matches nothing mints a bare row with one English name and no logo,
country or founding date. A name spelled slightly differently from a company
already on file becomes a second row that splits that company's credits, and
only a merge repairs it. IGDB spells companies its own way and runs on every
Fill, Replace and linked save, so it could mint such rows without anyone
typing a thing.

## How it is held

- **The rule is per media type and role.** `PICK_ONLY_CREDITS` in
  `app/services/domain/credits.py` is the set of pairs, and today it holds
  only `("game", "studio")` and `("game", "publisher")`. Other types' studio
  and publisher fields, Pull, the MAL fills, the DLsite fill and the backfill
  stay find-or-create. The owner's request named the game form. Whether every
  entry tab should refuse is still open (`docs/open-items.md`).
- **The IGDB fill applies it to h-game too.** One function fills both tables,
  and the request was about "the IGDB fill", not one table. The h-game form's
  own Developer field still quick-creates.
- **Refuse, don't drop.** A save naming an unknown company is refused as a
  whole and names every value. Saving the rest and silently dropping the
  credit would leave the admin believing it was saved. IGDB is the exception
  because it has nobody to ask: it skips the name and logs a warning, the same
  bargain an un-aliased IGDB genre gets.
- **An ambiguous name is refused or skipped, never guessed.** A name matching
  two rows (`AmbiguousNameError`) is treated like an unknown one.
- **The publisher's scope still widens.** Crediting an existing publisher on a
  game still adds `game` to its `publisher_scope`, as `resolve_publisher`
  does. Widening creates no company. The form suggests only the `game`-scoped
  publishers, so one offered only on other types is added to game from the
  Publisher tab, or credited by a direct API call.

## Rejected

- **Create from the form, as before.** This is the behaviour that produced
  the duplicates.
- **A confirm step ("create X?").** It still creates a bare row from inside
  the game form, and that bare row is the actual defect.
- **Skipping unknown names on the form save the way IGDB does.** It is a
  silent loss for someone who is present and could be told.
