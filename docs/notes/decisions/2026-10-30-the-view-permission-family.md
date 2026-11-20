# What a guest reads is a family of view permissions, not a login check

A logged-out visitor reads the libraries, the detail pages they lead to and the
dashboard's public sections. Everything around them is behind `view.*` role
permissions that `guest` does not hold as seeded.

- **Permissions, not "is anybody logged in".** A role grant can be given back:
  an editor may open search or the entity pages to the public by ticking a box
  on `guest`. Several keys rather than one, because the surfaces are
  independent.
- **Gated per read route, not per router.** A router-level dependency would
  also gate the writes on the same router, so a role holding `manage.catalog`
  without the read key could no longer save a studio.
- **A permission that gates nothing is removed, not left empty.** It still
  draws a checkbox on the role editor that appears to mean something.
- **Introducing a key needs a revision for established roles.** The seed tops
  up only a role holding nothing, so an existing role would never receive a
  new key and its members would lose the pages on deploy.
