# A content rating on people, studios and publishers gates them by access mode

People, studios and publishers - and the pictures in a person's gallery of
works - carry a `content_rating`: `normal` (the default), `borderline`
("Borderline (15+)") or `unrestricted` ("Unrestricted (18+)"). A record rated
above the viewer's active access mode is hidden, on top of the shared-record
connection rule: hidden when the rating is above the mode **or** the
connection rule hides it. The behaviour is in
[authorization.md](../../authorization.md#shared-records); this file keeps the
why.

## Why a rating of the record's own

The connection rule hides a shared record by what it is connected to, which is
right for a studio whose every credit is a hentai. It cannot express a record
that is adult in itself while being credited on ordinary entries - an
illustrator best known for 18+ work who also drew a mainstream light novel's
covers, or an agency whose name or logo should not appear in a safe session.
Such a record needs a fact about itself, and the access mode is already the
axis that decides which objects a session reaches.

## Why it only ever hides

The rating is ORed onto the connection rule, never substituted for it. A
`normal` rating on a studio credited only on hentai does not reveal it to a
mode that cannot see hentai. So the rating can be set without re-checking
every connection, and no value of it can widen what a session sees.

## Why no role is exempt, and an unresolved mode is `safe`

Content labels already narrow an admin in a narrow mode; the rating follows
the same axis, so an owner who switches to `normal` to preview what a guest
sees gets the same answer the guest does. A viewer whose mode did not resolve
is `safe`, fail-closed, as everywhere on the object axis.

## Why readers drop the record and writers keep it

A person credited on a visible entry used to be visible by construction, so
nothing filtered people out of an entry's credits or cast. The rating breaks
that, so every reader that names people, studios or publishers on another
record's page leaves out the rated-hidden ones, and the entry stays visible -
404ing an ordinary anime because its director is rated would hide far more
than the rating asks for. And because the editor never saw those rows, the
wholesale writers (credits, cast, gallery reorder) keep them, the rule
`hidden_scopes` already set for role and scope rows: absence from a form that
never showed a row is not a removal.

## Rejected alternatives

- **A content label on people.** Labels are entry-scoped - a label row
  belongs to an entry or a franchise, and every label reader walks entries -
  and they are per-account deniable, so a person's visibility would vary with
  each account's denials while the rating is meant to be one fact per record.
  Shared records were deliberately left without labels; giving them labels
  would bring the whole label machinery (Label tags, denials, the nsfw rule)
  to a table that has none of the inputs it reads.
- **A label or filter only, with no hiding.** A badge and a library filter
  would let a session choose not to look, but the record would still be
  listed, searchable and linked from every entry it is credited on. The owner
  chose hiding: a safe session should not be shown the record at all.
- **Deriving the rating from the record's credits.** That is the connection
  rule, which already exists; the cases this serves are exactly the ones whose
  credits do not say it.
- **404ing an entry whose credit is hidden.** It would make a rating on one
  person hide every ordinary entry they worked on.
