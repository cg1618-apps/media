# A deleted entry takes its relations with it

Both ends of a `media_relation` row are composite foreign keys onto
`media(system_id, media_type)`, ON DELETE CASCADE. Deleting an entry deletes
every relation it is either end of.

The owner asked for exactly this: deleting an entry must not leave a missing
entry in a relation afterwards. The endpoints used to carry no key, on the
reasoning that no single key could span the media tables and that a dangling
endpoint served as `missing` would stay "visible and fixable". In practice it
was neither: the canvas drew a red node nobody had asked for, every neighbour's
Related Entries card showed a broken row, and the row could not be fixed from
the page: deleting it and resetting its scope both answer 400 "Referenced
entry does not exist." for a missing endpoint, because both check that each
end exists and is visible before writing.

- **Why a foreign key now works.** The `media` supertable gives every media
  entry one id space, and each entry's AFTER DELETE trigger deletes its `media`
  row. A key onto `media` spans all the media tables, which is what the
  original decision said no key could do. It is composite, with the type, as
  `fk_plan_next_media_type` is, so an id can never be filed under a type that
  is not its own.
- **Rejected: deleting the relations in the entry router.** The entry router
  is one delete path of several — the `/delete` page's group cascades, Pull,
  a migration, a raw SQL fix — and every new path would have to remember it.
  The database cannot forget.
- **Rejected: keeping the pairs FK-less and sweeping orphans in Clean
  Orphans.** That leaves the broken rows on screen until somebody runs it,
  which is the state the owner asked to be rid of.
- **Rejected: replacing the pairs with a single `media_id` column per end.**
  The type would then have to be joined in on every read, the Sheets tab and
  every reader key on the pair, and the composite key already makes the pair
  impossible to get wrong.

The revision that added the keys deleted the relations that already named a
missing entry, since a key cannot be added over rows that violate it. Its
downgrade drops the keys and does not restore those rows: they named entries
that no longer exist.

A Pull meeting a sheet row that names an entry this database does not hold
skips and reports the row, rather than letting the foreign key roll back every
relation in the tab.
