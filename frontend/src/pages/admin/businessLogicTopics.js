// Frontend: the content of the Business Logic page, as data.
//
// Each topic is one slip on the page; each step is one numbered row in it, and
// a step may hold `substeps` (numbered 4.1, 4.2, ...) and `groups` (titled
// lists). Adding a topic is adding an object here - BusinessLogic.jsx knows
// nothing about any of them.
//
// Every sentence describes the code as it is. Calculate All is
// run_calculate_all in app/services/calculation.py, and the order below is
// the order it calls things in; docs/data-actions.md ("Calculate All") is the
// prose twin. Change one and the other in the same commit.
//
// Step shape:
//   title     what the step is, for an admin
//   fn        the function behind it, shown small
//   summary   one paragraph: what it changes and why
//   points    bullet list of the rules
//   groups    [{ title, points }] for a step with several halves
//   substeps  nested steps, same shape

const CAST_SYNC = {
  title: "Sync cast and characters",
  fn: "run_sync_cast",
  summary:
    "Keeps cast rows and the characters they cast in step. A cast row's original is the record it casts: the character's identity when the row names one, otherwise the character itself. Role, photo and seiyuu work both ways; a remark goes one way only, from a cast row up to its original, and is never copied down. It only fills empty fields — nothing that already holds a value is overwritten, and one run settles everything, so a second run changes nothing. The Sync Cast button on the Control Center runs this step on its own.",
  groups: [
    {
      title: "First: cast rows fill the character or identity",
      points: [
        "An empty character role takes the highest-ranked role among that character's cast rows (Main, then Core, Supporting, Other).",
        "An empty remark on a character or an identity takes the remark of its highest-ranked cast row that has one — by role order first, then the oldest row.",
        "An empty photo on a character or an identity is filled the same way, from its highest-ranked cast row that has a photo of its own.",
        "Only the rows casting that very record count: rows naming an identity fill the identity, rows naming no identity fill the character.",
      ],
    },
    {
      title: "Then: the original fills its cast rows",
      points: [
        "An empty cast role takes the character's role. An identity has no role of its own, so the character's stands in.",
        "A cast row's remark is never filled: a remark goes from the cast row up to the original, never back down.",
        "A cast row on a voiced type (anime, anime movie, hentai) with no seiyuu takes the original seiyuu, chosen as below.",
        "A cast row's photo is never filled: an empty one already shows the original's photo.",
      ],
    },
    {
      title: "How the original seiyuu are chosen",
      points: [
        "The seiyuu are not stored on the character. They are read from the same character-and-identity's other voiced cast rows.",
        "The seiyuu list used most often wins. Two lists used equally often go to the one whose oldest row is older.",
        "The winning list is copied, with each seiyuu's remark, from the oldest row that uses it.",
        "A row with no seiyuu does not vote, so an empty row never chooses for itself, and the choice is made before any row is filled, so the order rows are visited in cannot change it.",
      ],
    },
  ],
};

const CALCULATE_ALL = {
  key: "calculate-all",
  title: "Calculate All",
  intro: [
    "Calculate All re-runs every derivation over the whole database. It is the net under everything that writes rows without going through a form — a Pull from the sheet, a restore, a hand edit — and it is safe to run at any time. Most steps only fill what is empty; the few that rewrite or clear a value say so below.",
    "It runs from the Control Center. The steps run in this order, and each saves its work as it finishes.",
  ],
  steps: [
    {
      title: "Per-entry checks",
      fn: "run_post_processing",
      summary:
        "Walks every anime, anime movie, TV show, cartoon and manga and tidies each one on its own, saving after each type. Movie, novel, comic, game and the restricted types have nothing to do here. Nobody's watch or read progress is touched — that belongs to each user's own list.",
      points: [
        "Anime, TV show, cartoon: the episode total is made a whole number, never below zero; a value that is not a number is cleared.",
        "Manga: the same for the volume total and the chapter total.",
        "Anime and anime movie: an entry with a Bahamut link is marked as available on Bahamut, unless someone has already said whether it is.",
        "Anime: a TV anime with no season but a release date precise to the month takes its season from the month.",
        "Anime, TV show, cartoon: an entry with no season part takes one from its title (\"Season 2\", \"Part 2\"). If the title has none and it is the only one of its kind in its franchise — the only TV anime, the only TV show, the only TV cartoon — it becomes \"Season 1\".",
      ],
    },
    {
      title: "Episodes before each season",
      fn: "run_derive_ep_previous",
      summary:
        "For every franchise with anime, works out how many episodes the earlier seasons add up to (\"previous episodes\"), so a later season can show running episode numbers.",
      points: [
        "Only TV and ONA anime with a season part and no special marker take part. They are grouped by series — entries with no series form their own group — and ordered by season.",
        "Season 1 (or Season 1 Part 1) gets 0. Each later season gets the previous season's count plus that season's episode total.",
        "The chain stops at the first gap — a previous season with no episode total, or no count of its own — rather than guessing.",
        "Only empty values are filled; a count already there is kept.",
      ],
    },
    {
      title: "Seed sequel relations",
      fn: "run_seed_sequel_relations",
      summary:
        "Writes the obvious anime sequel chains into ACG franchises that have no relations yet. Relations are curated by hand; this is a one-time starting point, not a derivation.",
      points: [
        "A franchise is skipped if any relation touches any of its entries, of any type, at either end — someone has started curating it.",
        "The same anime as the step above (TV or ONA, a season part, no special), grouped by series and ordered by season. Each neighbouring pair becomes one sequel relation.",
        "A group where two entries share the same season is skipped whole rather than guessed at.",
        "A franchise seeded once has relations, so later runs leave it alone; a season added afterwards is linked by hand.",
        "The counts in Calculate All's closing message — relations created, franchises seeded, groups skipped — come from this step.",
      ],
    },
    {
      title: "Synchronise",
      fn: "run_sync",
      summary:
        "A run of smaller syncs, one after another in this order. Several of them also refresh the option scopes, explained once in the first.",
      substeps: [
        {
          title: "Anime: seasonal rows and counts",
          fn: "run_sync_anime",
          summary:
            "Every user gets a Seasonal row for every season the anime catalogue mentions; a season with nothing in it shows zeroes. Then every seasonal row's planned, watching, completed and dropped counts are recounted from that user's own list. These counts are always rewritten.",
          points: [
            "Only TV, ONA, Movie and Special anime count.",
            "Planned is Plan to Watch or Watch When Airs; watching is Active Watching, Passive Watching or Paused; dropped is Temp Dropped or Dropped.",
            "Option scopes: every option value an entry uses (a genre, a source) is made available for that entry's media type. This only ever adds — no scope is removed, and an option with no scopes, which is offered everywhere, is never given its first one. It reads every type's values each time, so the later repeats below change nothing new.",
          ],
        },
        {
          title: "Anime movie, TV show, cartoon, manga",
          fn: "run_sync_anime_movie · run_sync_tv_show · run_sync_cartoon · run_sync_manga",
          summary: "Each refreshes the option scopes and nothing else.",
        },
        {
          title: "Novel: totals from the arcs",
          fn: "run_sync_novel",
          summary:
            "Refreshes the option scopes, then recomputes each novel's arc and chapter totals from its arc rows (a volume-only novel has them cleared), and the owner's own arc and chapter progress on their list row. A list row is never created for a novel nobody has touched.",
        },
        {
          title: "Comic",
          fn: "run_sync_comic",
          summary: "Refreshes the option scopes and nothing else.",
        },
        {
          title: "H-Comic: the region rule",
          fn: "run_sync_h_comic",
          summary:
            "Refreshes the option scopes, then clears what an h-comic's region does not use, on every entry and every reader's list row.",
          points: [
            "KR: originality, animation status, series number and page total are cleared, and the reader's pages read.",
            "JP: chapter total, chapters behind and the highlight group order are cleared, and the reader's chapters read.",
            "A highlight group order that is not a list of names is dropped.",
          ],
        },
        {
          title: "Hentai",
          fn: "run_sync_hentai",
          summary: "Refreshes the option scopes and nothing else.",
        },
        {
          title: "Restricted-type labels",
          fn: "run_sync_gated_labels",
          summary:
            "Every entry of a restricted type (h-comic, h-game, hentai) gets the content label its type requires, and so does every franchise of that type's franchise type. That label is what keeps the entry out of sight for anyone whose access mode does not include it.",
        },
        {
          title: "Size groups",
          fn: "run_sync_size_groups",
          summary:
            "Rewrites each franchise's and series' derived size group per media type, which the Plan page uses to bucket them.",
          points: [
            "Anime is measured by its total episodes, comic by its total issues (series only), and TV show, cartoon and movie by how many entries there are.",
            "The derived value is rewritten freely. A size group an admin set by hand is never touched, and always wins over the derived one.",
          ],
        },
        CAST_SYNC,
      ],
    },
    {
      title: "Cover image check",
      fn: "bulk_check_cover_image",
      summary:
        "Runs the cover check — covers recorded on an entry but missing on disk, and files no entry uses. Inside Calculate All its result is thrown away, so it changes nothing; the Check & Download Covers button on the Control Center is where that report is read and acted on.",
    },
    {
      title: "Log the run",
      fn: "log_data_control",
      summary:
        "Writes a Data History row: Calculate / Calculate All / Manual / Success, and the closing message names the sequel relations seeded. If any step fails, a Failed row is written with the error instead and the run stops there; the steps that had already finished keep their changes.",
    },
  ],
};

export const BUSINESS_LOGIC_TOPICS = [CALCULATE_ALL];
