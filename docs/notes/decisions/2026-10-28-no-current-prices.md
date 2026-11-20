# Games keep the list price only; achievements have their own vocabulary

- **No current (sale) price is stored.** Steam's `final` price is what a sale
  moved the list price to on the day Fill last ran; nothing calculated with it,
  and a displayed sale price is wrong as soon as the sale ends. The list price
  (`price_original_*`, Steam's `initial`) is stable and serves every statistic.
  Steam's `final` is deliberately not mapped.
- **`all_achievements` has its own vocabulary, `GAME_ACHIEVEMENT_FLAGS`**
  (`Fully`, `Yes`, `No`, `Inapplicable`), because "every achievement except the
  hidden ones" and "every one, hidden included" are different answers. The
  other completion axes have no hidden tier, so `GAME_COMPLETION_FLAGS` is not
  given a value meaningless on them.
- **Ownership has no `Free`; acquisition does.** "Do I have it" and "how did I
  get it" overlapped, and a game claimed for nothing is simply owned.
- **Storefront `Physical Store`** is worded so it does not read as the copy
  format `Physical` in the same row.
