# Everything an account keeps is private to it, the admin included

No account reads another's list, ratings, plan, copies, choice marks, notes or
marks, and the admin reads none of them either.

- **What could only ever be empty was removed, not kept behind a setting**: the
  list-visibility setting, the public profile, reading personal notes by
  author, and the community card. `field_group.personal_notes` went for the
  same reason — it only decided whether a mode could read *another* account's
  personal notes.
- **Private from the admin too.** Nothing in the app shows the admin an
  account's list, ratings or notes, and it keeps none of its own.
- **Requests and reports are not an account's data in this sense**: they are
  addressed to whoever handles them.

## Catalogue or account: the test for anything added later

**If two people could disagree about it and both be right, it belongs to an
account; if it is a fact about the work, it belongs to the catalogue.** The
present split is `catalogue.md`.

- **Every personal rating is an account's; only external scores are
  catalogue**, because those are scores someone else published.
- **`remark` on entities, credits, relations, watch orders and options is
  catalogue**: editorial annotations on the shared record, not one reader's
  view.
- **`usefulness` is the account's own, and so is its meaning**; nothing defines
  what a value means.
- **A note section either changes scope or splits**: the row stays catalogue
  and named fields on it become each account's (note marks).
