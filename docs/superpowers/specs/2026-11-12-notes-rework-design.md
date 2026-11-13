# Notes rework — design

**Status: settled with the owner, not built.** Note changes decided during
the account-system discussion that are not about accounts. They are their
own work: implementation starts from this document, it becomes a plan, and
both are deleted when the work lands (see the platform `CLAUDE.md`,
"Finishing a plan").

**What is personal is decided in `2026-11-03-account-system-design.md`**,
not here: which note fields and sections belong to a user, mixed sections
(catalogue rows plus a user's own), and granted features. Where an item
below has a personal part, that part ships with the account work, and the
catalogue part can ship before it.

Current behaviour is in `docs/systems/notes.md` and `docs/catalogue.md`.

## Restricted types' reviews

**The restricted types drop 評論 Reviews and Comments.** H-Comic, Hentai
and H-Game get 大眾評價 Public Reviews (catalogue) and 我的評價 Personal
Reviews (personal) instead, as every other type has. A migration moves
the existing `reviews_and_comments` rows into `public_reviews` — from a
personal section into the catalogue, so their author stays as provenance
but they become everyone's.

## Game notes

Applying to `game` and `h-game` alike unless stated.

- **Common options for free-text groups are system options**, one
  category per section, edited on the options page like any other. Used as
  **suggestions**, not a closed list: the field stays free text — the way
  Song Type is suggested from its category today. They are edited in **a
  tab of their own** on the options edit pages, not in the System Options
  tab, though they are the same structure underneath. Settled values so far:
  - 角色 Characters `group`: 商人, 重要NPC, 主角, 同伴, 可攻略 (h-game
    especially), 反派;
  - 收集物 Collectibles `type`: 重要物品;
  - 道具 Items `type`: 重要道具, 任務道具;
  - the 地理 section's `group` (below): none for now — the category
    exists, empty.
- **Optional grouping for 攻略資源 Guide Resources.**
- **Collected status options** become: not collected, collected, enough
  collected, fully collected, skip, inapplicable (`collected` is new).
- **Optional amounts** on the collected sections: an amount total
  (catalogue — a fact about the game) and an amount collected (personal,
  beside `collected`).
- **NG Reset** on every row of the 物品 sections (武器&裝備 Weapons & Gear,
  道具 Items, 收集物 Collectibles): yes / no, default yes, catalogue. It
  drives a **reset button**, personal, that clears the user's own collected status
  (and amount collected) on every row marked yes, for starting a new game.
  敵人 Enemies has no NG Reset field: every enemy resets, so its button
  clears every `beaten`.
- **下周目目標**, a new subsection in NG 多周目: a list of text with one or
  more links. **Personal.**
- **A new section, 地理 Geography**, for `game` and `h-game`: group, name,
  description, link; the group has common options. It nests: C under B
  under A, where A and B are rows themselves — the `hierarchical` shape the
  four 劇情列表 story lists already use. Only a top-level row carries a
  group; the rows under it inherit it.
- **Quick move in 待辦 Todo.** A row can be moved quickly between the four
  buckets (現在進行, 接下來, 未來, 可能) without editing it. 存檔 Saves is
  excluded.
