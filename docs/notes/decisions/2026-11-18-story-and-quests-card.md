# 劇情&任務 Story & Quests is one structured card

- **The story is kept as structure, not prose.** The prose 劇情 sections covered
  what the 劇情列表 strands hold as a structure, and the owner chose the
  structure alone. One card, keyed `story_list` (keys are what code and tests
  name): the strands, then 支線任務 Side Quests, then 結局 Endings.
- **Side Quests is its own nestable structured section, not another strand.** A
  quest carries what a strand entry does not — region, cautions, prerequisite,
  NPCs, rewards and each viewer's own done status — and is always named. Its
  type is free text suggested from a `Side Quest Type` category and groups the
  roots, so a step under a chain carries no type of its own.
- **NPC suggestions come from the page's own rows** (`NoteField.suggest_from`):
  the page already holds every row of the owner, so a field naming its source
  section needs no endpoint and follows edits at once. The values stay names,
  not row ids, as `names` fields do for the cast.
