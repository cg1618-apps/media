# Favourite quotes and memes are each account's own

Whether a quote or meme is a favourite is each account's own, behind the
`favourites` switch, in `user_favorite`.

- **One table, two FK columns** (`quote_id` or `meme_id`, exactly one set, each
  cascading), the owner-column shape `user_rating` uses, so a deleted quote,
  meme or account takes its favourites with it and no merge code is needed.
- **Presence is the value.** A row exists only while the item is a favourite;
  there is no flag to disagree with the row's existence, and the PUT is
  idempotent by construction.
- **The switch hides, it does not delete.** With `favourites` off an account
  reads false everywhere, but its rows stay, so a misclick on `/users` loses
  nothing.
- **The write asks both switches, 401 for either.** Favouring a quote means
  reading it, and a caller without the quotes switch holds no quote reads at
  all — the read routes already say so with a 401, so this one does too rather
  than the 404 a hidden item gets.
- **An old backup's `is_favorite` clears as well as sets** the installation
  owner's favourite, since the old sheet held exactly the owner's view.
