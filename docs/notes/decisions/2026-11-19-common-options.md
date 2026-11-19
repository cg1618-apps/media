# Common Options are suggestion-only vocabularies

- **A common option is a suggestion-only vocabulary**: added only on the Add
  page, edited only on Modify, and never created from what someone typed. That
  is a property of the category, so the sub-tab is named for it ("Common
  Options"), and `COMMON_OPTION_CATEGORIES` sits beside `TAG_CATEGORIES` in
  `credit_roles.py`. The game guide suggestions, the music sections' Song Type
  and Song Source, and the Needs Work note are common options.
- **The grouping is presentation, so it lives in `TIER2_GROUPS`**, and the
  `/options` page and the sub-tab agree. A group *declared* with one member
  stands; the group-of-one rule is about a group the data shrank. Rejected: a
  per-picker threshold prop, which would make the two pages disagree about the
  same group.
- **No common option is created from typed text**: only tag, character tag,
  label and source fields reach the option resolver, and the note sections
  store their text as typed.
