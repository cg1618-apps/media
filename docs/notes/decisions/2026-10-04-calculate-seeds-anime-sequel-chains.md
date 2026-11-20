# Calculate All seeds anime sequel chains, once per franchise

- **Relations stay hand-curated.** An automatic prequel/sequel derivation was
  retired because it guessed wrong; this does not bring it back. It is a
  one-time seed (`seed_sequel_relations`) of the one chain that is rarely wrong
  — TV and ONA anime in one series ordered by `season_part` — so a newly
  imported franchise does not start with an empty canvas.
- **Gated on the franchise having no relations at all.** One row touching any
  entry of the franchise, of any type, at either end, means somebody has
  started curating it, and the seed writes nothing there. It never adds a link
  beside a hand-made one, and deleting a seeded row is never undone.
- **A franchise is seeded once.** Its own rows close the gate; idempotence
  comes from the gate, not from a marker column, and seeded rows are ordinary
  rows.
- **Ties are skipped, not guessed.** Two entries with the same `(season,
  part)` key leave the whole group unwritten and are counted in the message. A
  wrong stored relation is worse than a missing one.
- **One sort key**, `season_part_sort_key`, shared with the `ep_previous`
  derivation, so the two never disagree about which season comes first.
