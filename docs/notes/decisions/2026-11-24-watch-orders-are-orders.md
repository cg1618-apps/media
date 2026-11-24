# Watch orders are orders, all the way down

The feature was called a watch order, but one order can step through anime,
manga, books, comics and games together. It can be watched, read, played, or
all three. The page used a different noun for each type ("Play Order" on a
game, "Watch Order" everywhere else), so one mixed order went by two names.
It is now an **order** everywhere.

**Everything was renamed, not only the labels.** The owner chose a full rename
over relabelling the UI. That covers the four tables (`order_list`,
`order_section`, `order_item`, `order_follow`) with their sequence,
constraints and indexes, the models and schemas, the API (`/api/order/...`),
the pages (`/order/<id>`, `/orders`), the four Sheets tabs, and every label.
A code name that disagrees with the label is the kind of near-miss these
repositories keep paying for. Every later reader would have had to learn that
`watch_order` means "order", including in an order that holds no watching
at all.

**Old links keep working.** `/watch-order/<id>` and `/watch-orders` redirect,
carrying the id, slug, query and hash, the way `/novel` redirects to `/book`.
The API has no such shim, because the SPA is its only client and ships in
the same release.

**Old sheets keep restoring.** `LEGACY_TAB_NAMES` maps `Order List`,
`Order Section`, `Order Item` and `Order Follow` onto their `Watch Order …`
titles. A sheet backed up before the rename therefore still Pulls, with no
coordinated rename of the sheet. The columns kept their names, so only the
titles map.

**Rejected:**

- *A per-type noun* ("Watch / Read / Play Order"). This was the starting
  point, and it cannot name a mixed order.
- *Relabelling the UI only.* It is cheaper, with no migration and no Sheets
  mapping. It was rejected because the names underneath would disagree with
  the feature's name for good.

**Not part of this rename:** a comic's `read_order`. That is a number giving
an issue's place in its series, not this feature.
