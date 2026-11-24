# 優點, 缺點 and 優缺點 let the catalogue writer pick each row's kind

The three pros-and-cons lists were personal-scope: every row was its author's
alone, so a strength worth telling everyone had nowhere to go. They are now
**mixed** sections, and the catalogue writer picks each row's kind
(`NoteSection.kind_choice`): personal unless it asks for public. Every row
they held before is personal, its author unchanged.

**The existing row flag, not a new field.** A mixed section already stores
each row's kind in `note.personal`, and the API, the Sheets tab and the page
already read it. A second "visibility" field on these three sections would be
two answers to one question, and they can disagree.

**This reverses one rule of the mixed sections, for these three only.**
`2026-11-13-mixed-note-sections.md` settled that the server picks a mixed
row's kind from `manage.catalog`, with no "only me" switch, so an editor
writes catalogue rows only. It left the question open in its own words: a
`super` that needs rows of its own is dealt with if it ever happens. Here it
happened. The owner writes the catalogue and also keeps a private verdict
beside it. So in a `kind_choice` section an editor writes both kinds, and the
payload's `personal` decides. Every other mixed section keeps the old rule:
the guide sections are where the catalogue is built, and a personal default
there would change how every guide row is added.

**Personal is the default.** These lists held only private rows until now,
and a private default cannot publish anything by accident. A public row is
always an explicit choice.

**A non-editor asking for public is refused, not quietly made personal.**
The client asked for something it may not have. Writing a personal row
instead would look like success and keep the text private without saying so.

**The kind can be switched later, by the row's own author.** The other mixed
sections never promote a row, because there a member's row and the
catalogue have different authors. Here one account writes both kinds, and
choosing the wrong one is an ordinary slip. Switching is limited to the
caller's own rows, so an editor never takes another account's public row
into its private list.

**On Sheets the kind travels in a `public` column.** An older sheet carries
these sections' rows with `personal` FALSE, because they were personal by
section, so reading `personal` would publish every one of them on Pull.
`public` is written TRUE only on a public row of these sections. A sheet
without it restores them all personal, the safe direction.

**The page groups each card Public first, then Personal.** The owner asked for
this. It also makes the kind visible without a per-row marker.

**Rejected:**

- *A new field on these three sections.* It duplicates `note.personal`.
- *Giving every mixed section the choice.* It changes the guide sections'
  default for no gain.
- *A separate public section beside each private one*, such as
  `advantages_public`. It splits one card's rows across two sections, two
  orders and two lists, which the mixed design exists to avoid.
