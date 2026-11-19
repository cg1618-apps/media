# What counts as value, and what "should spend" means

Two figures on the statistics page's game spend are computed against a game's
list price (`price_original_us` / `_jp` / `_tw`), not only against what was
paid (`frontend/src/pages/statistics/gameSpend.js`).

- **A title with no list price is left out of the Value card.** Cost per hour
  answers "was this worth it", and what was paid for a bundle share, a free
  weekend or a gift is not what an hour of that game costs; left in, those rows
  sat permanently at the top of "best value". A recorded `0` counts as no list
  price.
- **The Value card reads the list price in the copy's own currency, never
  converted from another region's column.** `_jp` is yen because the column
  says so. Converting USD 59.99 into a TWD purchase would invent a number that
  reads exactly like a recorded one.
- **"Should spend" is the bought copies at list price — the same copies as
  Bought** — so the two columns subtract and the difference is what discounts
  were worth. Pricing per distinct game would answer a different question.
- **Should spend falls back to another region's list price (US, then JP, then
  TW), kept in that region's currency.** Dropping copies whose own currency had
  no list price made Should spend smaller than Bought and the columns stopped
  subtracting. No per-currency figure is invented; the currencies meet only in
  the converted totals, where every rate is one the owner entered.
