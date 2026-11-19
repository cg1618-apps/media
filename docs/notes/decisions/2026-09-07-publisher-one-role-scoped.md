# A publisher is one role, labelled per media type and scoped like people

- **One role, not two.** A Taiwanese licensor (木棉花) and an original publisher
  (Marvel) share the `publisher` role. Rejected: a separate `distributor_tw`
  role — a distributor on an anime is the same kind of fact as a publisher on a
  book, and splitting them would put one company's anime and manga credits in
  two vocabularies. The accepted cost: a comic with both an original publisher
  and a licensor shows them in one list, and the publisher page cannot say
  *why* an entry is credited.
- **"Publisher / Distributor" is never shown.** The label varies by media type
  through `_LABEL_OVERRIDES`: 台灣代理商 for anime, 台灣出版社 for manga and
  book, 出版商 for comic, 發行商 for game.
- **Publishers carry media-type scope, like people**, because scope cannot be
  derived from credits: a distributor added today must appear in the anime
  picker before its first credit. The scope table keys on `(publisher_id,
  scope)` with **no `role` column** — a publisher holds exactly one role, and a
  column "for symmetry" would encode a constant. It inherits the person rules:
  no unscoped "offered everywhere" state, and auto-scoping that only adds.
- **Names are never split by guessing.** Mixed strings like `Muse木棉花` were
  split from a curated map, not at the script boundary — an automatic split
  guesses wrong on `bilibili (GoodShow)`, and `name_normalize.py` states the
  rule: nothing is guessed.
