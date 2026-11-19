# The three restricted types are one franchise family

`FRANCHISE_FAMILY_FOR_TYPE` maps `H-Comic`, `Hentai` and `H-Game` to one family,
`restricted`. Fan-made works span all three types, and one doujin franchise
should hold the h-comics, the hentai and the h-games together. That is a choice
about grouping, not about visibility.

- **The family is named for all three, not for one of them.** The family string
  is code alone — no column, tab or migration stores it.
- **Name matching crosses the three**, so a doujin franchise is found by name
  from any of the three forms or sheet tabs.
- **Labels stay per type.** A franchise carries the label of each gated type
  its `franchise_type` names; joining a franchise does not add the joiner's
  type, so the hubs fetch every restricted list under any restricted
  franchise.
- **The mainstream boundary is unchanged**: a restricted entry in a mainstream
  franchise, or a franchise type spanning both families, is refused (422), so
  no gated entry reaches a public group.
