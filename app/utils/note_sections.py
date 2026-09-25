"""
The notes section registry - the single authority on what a note may be.

Notes used to be a JSONB blob whose shape lived in seven frontend config files.
The backend could not validate or query it, and the same section drifted
between media types. This module replaces those files: each entry declares one
section's shape, label, applicable owner types, ordering and dropdown values,
and both the API schema layer and the frontend read it from here.

Adding a section is one entry and no migration. Adding a new *shape* is rare
and costs one nullable column on `note`.

Each section also declares a `scope`: `catalog` sections hold one shared set of
rows written by admins and read by everyone, `personal` sections hold one set
per user and are read only by their author. That distinction lives here rather
than on the table so that changing it later stays a registry edit plus a data
reassignment - no schema change - which is the whole reason this module exists.

Sections that look similar across media types are deliberately kept distinct
(`highlights` vs `highlight_episodes` vs `highlight_passages`, `cinematography`
vs `craft`): the drift is intentional, not accidental.
"""

from dataclasses import dataclass, field

from app.utils.constants import H_COMIC_USEFULNESS
from app.utils.media_resolver import MEDIA_TYPE_KEYS, OWNER_TYPE_KEYS

# --- Shapes ---------------------------------------------------------------
# Each shape names which of `note`'s content columns a section uses. Columns a
# shape does not name stay null.
SHAPE_TEXT = "text"  # content
SHAPE_TEXT_LINKS = "text_links"  # content, links, optional episode
# content XOR one link. Distinct from text_links, which lets one row carry a
# body AND its sources: a public review is either what someone said or a
# pointer to where they said it, so mixing the two in one row is ambiguous.
SHAPE_TEXT_OR_LINK = "text_or_link"  # content or links[0], never both
SHAPE_EPISODE_TEXT = "episode_text"  # episode, content, kind where declared
SHAPE_NAME_LINKS = "name_links"  # title, links
# A named list whose items are each either a line of text or a labelled link,
# in one ordered array. name_links can only hold URLs, and text_links has no
# title, so neither can say "here is my Malenia plan: two notes and a video".
SHAPE_NAME_ENTRIES = "name_entries"  # title, entries
# The widest shape: the episode a song plays in, its name, what it does there,
# where to hear it, and how far tracking it has got. text_links has no title and
# name_links has no episode or body, so neither can say all of it. The status is
# the same Need/Pending/Done the music_track sections use - an insert song is
# tracked like an OP, it just also has an episode.
SHAPE_EPISODE_NAME_LINKS = (
    "episode_name_links"  # episode, title, content, links, status
)
# One theme song of a work: its name, which cut it is, how far tracking it has
# got, where to hear it, and a remark. The only shape with two dropdowns - the
# type is a property of the song, the status is a property of my work on it -
# which is why `note` carries a `status` column alongside `kind`.
SHAPE_MUSIC_TRACK = "music_track"  # title, kind, status, links, content
# The registry-driven shape. Unlike the eight above, `structured` does not name
# a fixed set of columns: the SECTION declares an ordered `fields` spec, each
# field saying what it is called, how it is edited, and where it is stored -
# either one of `note`'s existing content columns or a key inside the `fields`
# JSONB blob. One component renders every structured section and one validator
# checks every one of them, so a section that grows a field stays a registry
# edit rather than a migration plus a new component.
#
# It exists because the game guide sections need field sets no fixed shape can
# express - a variant, an alias, a region, four stat values, and lists nested
# inside a row (a build's armour, a team's members). Those nested lists cannot
# be columns at any price, so a JSONB blob was arriving regardless; `fields`
# makes the scalars beside them registry-declared too.
SHAPE_STRUCTURED = "structured"
# Backed by its own table (quote, meme), never by a `note` row.
SHAPE_EXTERNAL = "external"

STORED_SHAPES = frozenset(
    {
        SHAPE_TEXT,
        SHAPE_TEXT_LINKS,
        SHAPE_TEXT_OR_LINK,
        SHAPE_EPISODE_TEXT,
        SHAPE_NAME_LINKS,
        SHAPE_NAME_ENTRIES,
        SHAPE_EPISODE_NAME_LINKS,
        SHAPE_MUSIC_TRACK,
        SHAPE_STRUCTURED,
    }
)

# --- Scopes ---------------------------------------------------------------
# Whose rows a section holds. The distinction lives here rather than in the
# schema because this module's own rule is "adding a section is one entry and
# no migration", and a catalogue/personal reclassification must obey it: it is
# a registry edit plus a data reassignment, never an ALTER TABLE.
SCOPE_CATALOG = "catalog"  # one shared set of rows, admin-authored
SCOPE_PERSONAL = "personal"  # one set per user

# --- Owner groups ---------------------------------------------------------
# Both derive from media_resolver rather than restating its lists: a new media
# type must not silently leave a group here stale.
ENTRY_OWNERS = MEDIA_TYPE_KEYS
ALL_OWNERS = tuple(OWNER_TYPE_KEYS)

# The owners every game-shaped section serves: game, and h-game, which reuses
# game's notes wholesale. A section written for games names this rather than
# ("game",), so a future game section reaches h-game by default; the per-owner
# maps below (labels, placeholders, groups) are built over it the same way.
GAME_OWNERS: tuple[str, ...] = ("game", "h-game")


def _for_game_owners(value) -> dict:
    """One per-owner override, given to every game owner alike."""
    return {owner: value for owner in GAME_OWNERS}

# Sections every owner shares, spelled out per section below rather than
# composed, so one section's applicability is readable in one place.
_SERIES_AND_UP = ("series", "franchise")


# --- Structured fields ----------------------------------------------------
# How one field of a `structured` section is edited.
FIELD_TEXT = "text"  # one line
FIELD_TEXTAREA = "textarea"  # a body
FIELD_SELECT = "select"  # a dropdown over `options`
FIELD_LINKS = "links"  # the repeatable URL editor
FIELD_LIST = "list"  # a repeatable row of `item_fields`
# A list of free-text names, e.g. the characters a highlight is about. Always
# stored in `fields`, never in a column: no `note` column holds a list of
# strings. The editor suggests the names of the characters cast on the owner,
# but any non-empty string is accepted - these are names, not character ids,
# so renaming a character does not rewrite a row that named it.
FIELD_NAMES = "names"

# The `note` columns a structured field may claim. Anything else a section
# declares is stored under its own key in the `fields` JSONB blob.
#
# The list is deliberately the columns that already MEAN these things: a name
# is a title, a description is content, and the two dropdown columns stay the
# two dropdowns. A structured section that put its name in `fields` would hide
# it from the Google Sheets tab and from every existing reader of `title`, for
# no gain - the column is already there and already empty.
FIELD_COLUMNS = frozenset({"locator", "kind", "status", "title", "content", "links"})


@dataclass(frozen=True)
class NoteField:
    """
    One field of a `structured` section.

    `column` is the whole point of the shape. A field naming one of
    FIELD_COLUMNS reads and writes that column, so `skills` - type, name,
    description, links - needs no JSONB at all; a field naming none is stored
    at `fields[key]`. Both kinds are declared the same way and rendered by the
    same component, so which side of the line a field falls on is a storage
    decision rather than a UI one.
    """

    key: str
    label: str
    type: str = FIELD_TEXT
    # One of FIELD_COLUMNS, or None to store under `fields[key]`.
    column: str | None = None
    # Allowed values for FIELD_SELECT. A `kind`- or `status`-backed field with
    # no options is free text, which is why those two columns are no longer
    # validated against `kinds` / `statuses` for a structured section.
    options: tuple[str, ...] = ()
    required: bool = False
    # What a NEW row starts this field on. The row-level twin of
    # NoteSection.default_kind, which the structured shape does not use - a
    # structured section's dropdowns are fields, so their defaults are too.
    #
    # A defaulted field is EXCLUDED from the "is this row empty?" check, for
    # the reason music_track spells out about `default_kind`: a value that is
    # always set cannot be the thing that makes a row worth storing. Without
    # that, an untouched draft with a prefilled status would save as a row
    # saying nothing.
    default: str | None = None
    # For FIELD_LIST: the shape of one row of the nested list. Nested lists are
    # always stored in `fields` - a column cannot hold one.
    item_fields: tuple["NoteField", ...] = ()
    # Render an inline stepper beside the value, editable without opening the
    # row for edit. Used by the stat sections' "my value", which is the one
    # field of a guide that changes while playing rather than while writing.
    quick_edit: bool = False
    placeholder: str | None = None


@dataclass(frozen=True)
class NoteGroup:
    """A run of sections the page renders inside one collapsible card."""

    key: str
    label: str
    icon: str


# Grouping is display-only: a grouped section is still an ordinary registry
# entry with its own rows, and `group` is the only thing that puts it inside a
# card. The page renders that card BESIDE the Notes card rather than within it,
# so a group is a peer of Notes, not a section of it. Sections sharing a group
# are kept adjacent in NOTE_SECTIONS below - the page no longer needs them to
# be, but the order is what a reader uses to see a group whole.
NOTE_GROUPS: tuple[NoteGroup, ...] = (
    NoteGroup(key="reviews", label="評論 Reviews and Comments", icon="fa-comments"),
    # The key is not `analysis` because a section already owns that key. The two
    # namespaces are separate dicts, but a reader scanning for "analysis" should
    # not have to work out which one a bare key means.
    NoteGroup(
        key="analysis_group",
        label="解析 Analysis and Cinematography",
        icon="fa-clapperboard",
    ),
    # The key `guides` is free only because the SECTION `guides` was retired
    # when this group replaced it. Group keys and section keys are separate
    # dicts, so the two could coexist - `analysis_group` above is keyed that way
    # to avoid making a reader work that out. Here the collision was removed
    # instead, which is why this key does not need the same suffix.
    NoteGroup(key="guides", label="攻略 Guides", icon="fa-map"),
    NoteGroup(key="builds", label="養成&流派 Builds & Growth", icon="fa-chart-simple"),
    # NOT keyed `items`: a SECTION owns that key. Group keys and section keys
    # are separate dicts so the two could coexist, but a reader scanning for
    # "items" should not have to work out which namespace a bare key means -
    # the same reason `analysis_group` is not `analysis`.
    NoteGroup(key="gear", label="物品 Items & Gear", icon="fa-sack-xmark"),
    # The key stays `compendium` though the card now holds glossaries too: keys
    # are what code and tests name, and the label is the only part a reader
    # sees.
    NoteGroup(key="compendium", label="圖鑑與名詞 Compendium & Terms", icon="fa-dragon"),
    # 劇情 is what HAPPENS; `analysis_group` above is what it MEANS. Keeping
    # them apart is why `story_other` exists - a stray observation lands there
    # rather than drifting into Analysis.
    NoteGroup(key="story", label="劇情 Story", icon="fa-book-open"),
    # 劇情 above is what happens, written as prose. This is the same story as
    # a STRUCTURE: a numbered, nestable list of the things it is made of, so
    # "chapter 3, scene 2" is two rows and a parent link rather than a
    # sentence. The two are deliberately not merged - a plot note and an
    # outline entry are read at different times and neither reads well as the
    # other.
    NoteGroup(key="story_list", label="劇情列表 Story List", icon="fa-list-ol"),
    # The world the story happens IN, split out of 劇情 so that card holds only
    # what happens and to whom. After 劇情列表 rather than between the two,
    # because 劇情 and 劇情列表 are one story told twice and read as a pair.
    NoteGroup(key="worldbuilding", label="世界觀 Worldbuilding", icon="fa-earth-asia"),
    # NOT "進度 Progress": Game.jsx already renders a <Slip title="Progress">
    # (playtime and achievements) on the same page, and two cards with one name
    # is the `resources` / `builds_and_mods` collision again.
    NoteGroup(key="todo", label="待辦 Todo", icon="fa-list-check"),
    NoteGroup(key="music", label="音樂 Music", icon="fa-music"),
    # Renders near the end, beside the site-wide Resources card rather than
    # with the 攻略 run, because what it holds is not part of the guide.
    NoteGroup(key="tools", label="資源&工具 Tools & Resources", icon="fa-screwdriver-wrench"),
    NoteGroup(key="quotes_memes", label="名言/梗 Quotes and Memes", icon="fa-quote-right"),
)

_GROUPS_BY_KEY = {g.key: g for g in NOTE_GROUPS}


@dataclass(frozen=True)
class NoteSection:
    """One section of the notes page."""

    key: str
    shape: str
    label: str
    owners: tuple[str, ...]
    # catalog: one shared set of rows, written by admins, read unfiltered by
    # everyone. personal: one set per user, read only by its author.
    # None only for SHAPE_EXTERNAL sections, which store no `note` row at all.
    #
    # No default, deliberately. A default would let the next section added
    # inherit a scope by omission, and the wrong inheritance publishes one
    # person's private note to every user. A test asserts the absence.
    scope: str | None
    # Per-owner label overrides; `label` is the fallback.
    labels: dict[str, str] = field(default_factory=dict)
    # The group whose card this section renders inside. None renders flat.
    group: str | None = None
    # Per-owner group overrides; `group` is the fallback. The same shape as
    # `labels` and `kinds_by_owner` above, and for the same reason: a section
    # that means something slightly different to one owner belongs in a
    # different place for that owner, and splitting it into two sections would
    # split its rows too.
    #
    # 解析 Analysis is the one case. For a film or a series it sits beside
    # 分鏡/演出, 伏筆 and 對稱 in its own card, because those four are one
    # subject. A game has none of those three, so that card would hold exactly
    # one section - and an analysis of a game is read with the opinions rather
    # than apart from them, so for `game` it goes in 評論 Reviews. Where it
    # lands within that card is still registry order, and `analysis` is
    # declared after the review sections, so it reads last.
    groups_by_owner: dict[str, str] = field(default_factory=dict)
    # Render this section as its own top-level card instead of inside the Notes
    # card. Every shape component already draws its own SectionCard, so a
    # standalone section needs no wrapper - it is simply lifted out. This is for
    # a section that stands alone; a section that belongs with others gets a
    # `group`, and setting both is meaningless (a test forbids it).
    standalone: bool = False
    # Allowed values for note.kind. Empty means the section has no dropdown.
    kinds: tuple[str, ...] = ()
    # Which kind a new row starts on. None starts blank.
    default_kind: str | None = None
    # Allowed values for note.status - how far tracking has got. Used by the
    # music_track sections and by insert_songs. Empty means no status field.
    statuses: tuple[str, ...] = ()
    # Per-owner kind overrides; `kinds` is the fallback. A section may offer a
    # dropdown to some owners and none to others - manga highlights are always
    # 神回, so a chooser there would have one choice.
    kinds_by_owner: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # The label for `note.locator` - what "where in the work" means here. None
    # means the section has no anchor and shows no field.
    locator_placeholder: str | None = None
    # Per-owner locator-placeholder overrides; `locator_placeholder` is the
    # fallback. Manga counts chapters, not episodes.
    locator_placeholders: dict[str, str] = field(default_factory=dict)
    # Sections whose whole point is the anchor: an OP change with no episode,
    # or a highlight with no episode, says nothing. Section-level rather than
    # per-owner, unlike `desc_required` - that is true of every owner the
    # section has.
    locator_required: bool = False
    # At most one row per owner.
    singleton: bool = False
    # Owner types where `content` may not be empty.
    desc_required: tuple[str, ...] = ()
    # --- `structured` sections only -------------------------------------
    # The ordered field spec this section's rows are made of. Empty for every
    # other shape; a test asserts the two go together in both directions.
    fields: tuple[NoteField, ...] = ()
    # Groups of field keys where at least one must be filled. The Story List
    # sections use it for "an entry needs an order number or a name, and may
    # have both". Distinct from `NoteField.required`, which is about one field
    # on its own.
    require_any: tuple[tuple[str, ...], ...] = ()
    # Rows may nest: a row carries `parent_id` pointing at another row of the
    # same section, to any depth. Flat sections refuse a parent outright, so a
    # section does not grow a tree by accident.
    hierarchical: bool = False
    # The key of a `names` field the read view groups rows by: one group per
    # name, and a row naming two appears under both. Display-only - rows are
    # stored and ordered exactly as in any structured section. The order of
    # the GROUPS is the owner entry's, not this registry's (for h-comic and
    # h-game, `highlight_group_order` on the entry). Checked at import.
    group_by: str | None = None
    # Owner-entry columns this section is limited to: {column: allowed
    # values}. The note router refuses (422) a row on an owner whose column
    # holds anything else, and the page renders no card for it. Empty means
    # every owner of the section's types.
    owner_where: dict[str, tuple[str, ...]] = field(default_factory=dict)


OP_ED_KINDS = ("變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED")

# Which cut of a theme song a row is about. Shared by the three music_track
# sections so OP and ED cannot drift apart.
MUSIC_TYPES = ("normal", "different version", "all inclusive version")

# How far I have got with a song: the same three values the anime.op / ed /
# insert_ost columns held before they became note rows. Every music section
# offers it, insert_songs included - it is the one thing they all track.
MUSIC_STATUSES = ("Need", "Pending", "Done")

# How far a boss or an enemy has got. Closed, unlike the tier beside it: a
# tier is the game's vocabulary and differs per game, where this is a fact
# about my run and reads the same everywhere. "Cheesed" is deliberately not
# folded into "beaten" - it is the answer to "do I still owe this one a fair
# fight?".
ENEMY_STATUSES = ("to beat", "beaten", "cheesed", "skip")

# How far collecting one kind of thing has got. Ordered as a progression with
# the opt-out last, like ENEMY_STATUSES above: "enough" is the state a
# completionist run leaves behind and a normal run stops at, and it is worth
# distinguishing from "fully" precisely because most things never reach
# "fully".
COLLECT_STATUSES = (
    "not collected",
    "enough collected",
    "fully collected",
    "skip",
)

# Whether an ending has been seen. "Skipped" is a decision, not an absence,
# which is why it is a value rather than leaving the field blank.
ENDING_STATUSES = ("not yet", "reached", "skipped")

# Whether a mod is installed and what it is for. 常駐 is the always-on set -
# the mods that go on every install before anything else.
MOD_STATUSES = ("常駐", "to use", "to play", "played", "won't")

# What a 模組&工具 row is. Carried over from the section's old `kinds`.
MOD_KINDS = ("Mod", "Tool")


def _named_thing_fields(
    variant: bool = False, collected: bool = False
) -> tuple["NoteField", ...]:
    """
    The shape four guide sections share: a typed, named thing with a body and
    its sources.

    Skills, collectibles, items and weapons differ only in whether a row can
    carry a variant ("+3", "Ashes of War", "NG+ only") and whether collecting
    it is something you track, so they share a spec rather than repeating one
    four times. The three 物品 sections take both; 技能 Skills takes neither -
    a skill is learned rather than collected, and a collect status on it would
    be a field nobody could answer.

    The `type` field is a free-text select on `kind`: every one of these
    vocabularies is the game's rather than ours, so a closed list would be
    wrong by the second game. `collected` is the opposite - it is a fact about
    my run, so it reads the same everywhere and is closed.
    """
    return (
        NoteField(key="type", label="Type", type=FIELD_SELECT, column="kind"),
        NoteField(key="name", label="Name", column="title"),
        *((NoteField(key="variant", label="Variant"),) if variant else ()),
        NoteField(
            key="description",
            label="Description",
            type=FIELD_TEXTAREA,
            column="content",
        ),
        NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
        *(
            (
                NoteField(
                    key="collected",
                    label="Collected",
                    type=FIELD_SELECT,
                    column="status",
                    options=COLLECT_STATUSES,
                    default="not collected",
                ),
            )
            if collected
            else ()
        ),
    )


def _term_fields(typed: bool = False) -> tuple["NoteField", ...]:
    """
    The shape the four glossary sections share: a term's Chinese name, what
    else it is called, and what it means.

    遊戲名詞 Game Terms, 玩家術語 Player Terms, 劇情名詞 Story Terms and 玩法系統
    Gameplay Systems differ only in whether a row carries a type. A glossary
    term needs none; a gameplay system does, because "game mode", "gacha" and
    "upgrade system" are different KINDS of system in a way two glossary terms
    are not. The type is free text for the reason `_named_thing_fields` gives:
    the vocabulary is the game's, so a closed list would be wrong by the
    second game.

    The Chinese name is the row's name, so it is the `title` column - the one
    a structured row is headed by. The alternative name follows the entry
    tables' `*_name_alt` in both key and meaning: an English, Japanese or
    in-game spelling, whichever the game uses.

    None carries links. Each is looked up rather than sourced, and a write-up
    worth keeping belongs in 攻略資源 Guide Resources.
    """
    return (
        *(
            (NoteField(key="type", label="Type", type=FIELD_SELECT, column="kind"),)
            if typed
            else ()
        ),
        NoteField(key="name_cn", label="Name (CN)", column="title"),
        NoteField(key="name_alt", label="Alt Name"),
        NoteField(
            key="description",
            label="Description",
            type=FIELD_TEXTAREA,
            column="content",
        ),
    )


# A standout episode, a standout moment inside one, and a standout arc across
# several. Shared by the two episode-shaped highlight sections so they cannot
# drift apart.
HIGHLIGHT_KINDS = ("神回", "神片段", "神篇章")

def _plot_fields() -> tuple["NoteField", ...]:
    """
    主線劇情 and 支線劇情: a chapter, what happens in it, and where that came
    from.

    The chapter keeps the `locator` column it held as an episode_text
    section, so no row had to move when links were added.
    """
    return (
        NoteField(
            key="chapter",
            label="Chapter",
            column="locator",
            placeholder="Chapter / Part, e.g. Ch 3",
        ),
        NoteField(
            key="description",
            label="Description",
            type=FIELD_TEXTAREA,
            column="content",
        ),
        NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
    )


# The four strands a story is listed along. Kept as data rather than four
# spelled-out entries because they differ ONLY in key and label: four copies
# of one eight-line spec is four places for them to drift apart.
STORY_LIST_STRANDS = (
    ("story_list_main", "主線 Main"),
    ("story_list_side", "支線 Side"),
    ("story_list_character", "角色 Character"),
    ("story_list_event", "事件 Event"),
)


def _story_list_sections() -> tuple["NoteSection", ...]:
    """One nestable, ordered list per strand of the story."""
    return tuple(
        NoteSection(
            key=key,
            shape=SHAPE_STRUCTURED,
            label=label,
            owners=GAME_OWNERS,
            scope=SCOPE_CATALOG,
            group="story_list",
            hierarchical=True,
            require_any=(("order", "name"),),
            fields=(
                # Free text, not a number: an entry is numbered "3", "3.2",
                # "II", "v1.4" or "Act I" depending on the work, and a
                # numeric column would refuse four of those five.
                NoteField(
                    key="order",
                    label="No.",
                    column="locator",
                    placeholder="e.g. 3.2",
                ),
                NoteField(key="name", label="Name", column="title"),
                NoteField(
                    key="description",
                    label="Description",
                    type=FIELD_TEXTAREA,
                    column="content",
                ),
                NoteField(
                    key="links", label="Links", type=FIELD_LINKS, column="links"
                ),
            ),
        )
        for key, label in STORY_LIST_STRANDS
    )


# Order here is display order.
NOTE_SECTIONS: tuple[NoteSection, ...] = (
    NoteSection(
        key="remark",
        shape=SHAPE_TEXT,
        label="備註 Remark",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        singleton=True,
    ),
    NoteSection(
        # 備註 above is ONE block of prose, and stays one: a long remark wants
        # to be written as a paragraph, not as bullets. This is the other half
        # - the short things, one per row, that a single block turns into a
        # wall. They are deliberately NOT merged: a list whose first item is
        # three paragraphs reads as badly as a paragraph made of bullets.
        #
        # Personal, like 備註, and non-singleton, which is the whole point.
        # Every owner, like 備註: the need came from games, but nothing about
        # a short note is game-shaped, and the two sections are read as a pair
        # wherever 備註 appears.
        key="remark_list",
        shape=SHAPE_TEXT_LINKS,
        label="備註列表 Remark List",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
    ),
    NoteSection(
        key="advantages",
        shape=SHAPE_TEXT,
        label="優點 Advantages",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="disadvantages",
        shape=SHAPE_TEXT,
        label="缺點 Disadvantages",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="double_edged",
        shape=SHAPE_TEXT,
        label="優缺點",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="public_reviews",
        shape=SHAPE_TEXT_OR_LINK,
        label="大眾評價 Public Reviews",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        group="reviews",
    ),
    NoteSection(
        key="personal_reviews",
        shape=SHAPE_TEXT,
        label="我的評價 Personal Reviews",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="episode_comments",
        locator_required=True,
        shape=SHAPE_TEXT_LINKS,
        label="各集評論 Episode Comments",
        owners=("anime", "tv-show", "cartoon") + GAME_OWNERS,
        scope=SCOPE_PERSONAL,
        # A game is cut into chapters or parts rather than episodes, but the
        # section is the same one: a comment on one segment of the work.
        labels=_for_game_owners("各章評論 Part Reviews"),
        locator_placeholder="Episode, e.g. ep 1",
        locator_placeholders=_for_game_owners("Chapter / Part, e.g. Ch 3"),
        group="reviews",
    ),
    NoteSection(
        key="highlights",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段 Highlights",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 6",
        # The stored data distinguishes a great episode from a great moment or
        # arc, so the section keeps a dropdown even though its siblings do not.
        kinds=HIGHLIGHT_KINDS,
    ),
    NoteSection(
        key="highlight_episodes",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段",
        owners=("tv-show", "cartoon", "manga"),
        scope=SCOPE_CATALOG,
        labels={"manga": "神回"},
        # TV shows and cartoons draw the same distinction anime does. Manga
        # does not, so it keeps the plain field.
        kinds_by_owner={"tv-show": HIGHLIGHT_KINDS, "cartoon": HIGHLIGHT_KINDS},
        locator_placeholder="Episode(s), e.g. ep 3",
        locator_placeholders={"manga": "Chapter(s), e.g. ch 6"},
    ),
    NoteSection(
        key="highlight_passages",
        shape=SHAPE_TEXT,
        label="神片段",
        owners=("novel",),
        scope=SCOPE_CATALOG,
    ),
    NoteSection(
        key="highlight_moments",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神場景 Highlights",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        locator_placeholder="Chapter / Boss, e.g. Ch 3",
    ),
    NoteSection(
        # A KR h-comic's standout scenes, grouped by the female characters in
        # them. KR only: a JP entry is refused a row (owner_where) and renders
        # no card. The group order is a column on the entry,
        # h_comic.highlight_group_order, written through the entry update.
        key="h_comic_highlights",
        shape=SHAPE_STRUCTURED,
        label="亮點 Highlights",
        owners=("h-comic",),
        scope=SCOPE_CATALOG,
        group_by="female_characters",
        owner_where={"region": ("KR",)},
        fields=(
            NoteField(
                key="female_characters",
                label="Female Characters",
                type=FIELD_NAMES,
                required=True,
            ),
            NoteField(
                key="male_characters",
                label="Male Characters",
                type=FIELD_NAMES,
            ),
            NoteField(
                key="chapter",
                label="Chapter",
                column="locator",
                placeholder="Chapter(s), e.g. 1-5",
            ),
            NoteField(key="location", label="Location"),
            # A `kind`-backed field with no options is free text.
            NoteField(key="label", label="Label", column="kind"),
            NoteField(
                key="usefulness",
                label="Usefulness",
                type=FIELD_SELECT,
                column="status",
                options=H_COMIC_USEFULNESS,
            ),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
        ),
    ),
    NoteSection(
        # An h-game's standout scenes, grouped by the female characters in
        # them: h_comic_highlights' fields, located by route and scene rather
        # than by chapter. Every h-game takes it, so there is no owner_where.
        # The group order is h_game.highlight_group_order, written through the
        # entry update. Only the second copy of these fields, so they are not
        # factored out.
        key="h_game_highlights",
        shape=SHAPE_STRUCTURED,
        label="亮點 Highlights",
        owners=("h-game",),
        scope=SCOPE_CATALOG,
        group_by="female_characters",
        fields=(
            NoteField(
                key="female_characters",
                label="Female Characters",
                type=FIELD_NAMES,
                required=True,
            ),
            NoteField(
                key="male_characters",
                label="Male Characters",
                type=FIELD_NAMES,
            ),
            NoteField(
                key="route_scene",
                label="Route / Scene",
                column="locator",
                placeholder="Route / Scene, e.g. Route A, scene 3",
            ),
            NoteField(key="location", label="Location"),
            # A `kind`-backed field with no options is free text.
            NoteField(key="label", label="Label", column="kind"),
            NoteField(
                key="usefulness",
                label="Usefulness",
                type=FIELD_SELECT,
                column="status",
                options=H_COMIC_USEFULNESS,
            ),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
        ),
    ),
    NoteSection(
        key="analysis",
        shape=SHAPE_TEXT_LINKS,
        label="解析 Analysis",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        group="analysis_group",
        # For a game, the last subsection of 評論 Reviews rather than a card
        # of its own - see `groups_by_owner`. It is the only section of
        # `analysis_group` a game has, so that card disappears for games
        # rather than being left holding one thing.
        groups_by_owner=_for_game_owners("reviews"),
    ),
    NoteSection(
        key="cinematography",
        shape=SHAPE_TEXT_LINKS,
        label="分鏡/演出/巧思",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "manga", "series"),
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
        group="analysis_group",
    ),
    NoteSection(
        key="craft",
        shape=SHAPE_TEXT_LINKS,
        label="巧思",
        owners=("novel",),
        scope=SCOPE_CATALOG,
        group="analysis_group",
    ),
    NoteSection(
        key="foreshadowing",
        shape=SHAPE_TEXT_LINKS,
        label="Foreshadowing",
        owners=(
            "anime",
            "anime-movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        )
        + _SERIES_AND_UP,
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
        group="analysis_group",
    ),
    NoteSection(
        key="symmetry",
        shape=SHAPE_TEXT_LINKS,
        label="對稱 Symmetry",
        owners=(
            "anime",
            "anime-movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        )
        + _SERIES_AND_UP,
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
        group="analysis_group",
    ),
    # --- 攻略 Guides ------------------------------------------------------
    # Fifteen sections rather than one section with a kind, because each is a
    # list somebody actually keeps separately: which build to run is not the
    # same question as where the collectibles are. All game-only - 屬性&配點
    # means nothing for a novel - and all catalogue: a guide is shared.
    #
    # `name_entries` where a row is one NAMED thing and what is known about it
    # (a quest, a build, a boss, an ending); `text_links` where it is advice
    # with sources and no name. Neither shape renders a locator, so "which
    # area" is written as an entry line.
    # --- 攻略 Guides ------------------------------------------------------
    # How it plays and what is worth knowing, which is what somebody opening a
    # guide for the first time wants. The four cards below it are the guide's
    # CONTENT, split by the question each answers; this one is the way in.
    #
    # 攻略 was one card holding fifteen sections, which read as a wall of
    # collapsed headers rather than as a guide. `group` is display-only, so
    # splitting it was a registry edit: no migration, no data change, and each
    # card collapses on its own when empty.
    NoteSection(
        key="beginner",
        shape=SHAPE_TEXT_LINKS,
        label="新手 Beginner",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        # What there is to play: the modes, the enhancement and upgrade
        # systems, the pull system, the stages to clear, the style of play.
        # Straight after 新手 Beginner because it is the other half of the way
        # in - Beginner is advice, this is the inventory of what the advice is
        # about. The type says which kind of system a row is.
        key="gameplay_systems",
        shape=SHAPE_STRUCTURED,
        label="玩法系統 Gameplay Systems",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="guides",
        fields=_term_fields(typed=True),
    ),
    NoteSection(
        # The first structured section, and the smallest: a control is the
        # button or stick a line of advice is ABOUT, so it reads as a name
        # rather than as the first words of the description. Optional, because
        # plenty of control notes are about the scheme as a whole.
        key="controls",
        shape=SHAPE_STRUCTURED,
        label="操作 Controls",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="guides",
        fields=(
            NoteField(
                key="control",
                label="Control",
                column="title",
                placeholder="e.g. L2 + O",
            ),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
        ),
    ),
    NoteSection(
        # The overflow of the 攻略 group: a guide remark that belongs to no
        # list in particular. 新手 Beginner above it is advice for somebody
        # STARTING; this is everything else, and having it keeps a stray note
        # out of whichever list happens to be open.
        #
        # Order carries no meaning, so its rows are appended and left alone.
        key="guide_notes",
        shape=SHAPE_TEXT_LINKS,
        label="攻略筆記 Guide Notes",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="trivia",
        shape=SHAPE_TEXT_LINKS,
        label="小知識 Trivia",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    # --- 養成&流派 Builds & Growth ----------------------------------------
    # How to build: where the points go, what they unlock, what that adds up
    # to, and who else is in the party. In that order, because that is the
    # order the decisions are actually made in.
    NoteSection(
        # One row is one stat: what it is called, the three public thresholds
        # for it, and where mine currently sits. `my_value` is the only field
        # of any guide section that changes while PLAYING rather than while
        # writing, which is why it alone is quick-editable.
        key="stats_and_points",
        shape=SHAPE_STRUCTURED,
        label="屬性&配點 Stats & Points",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="builds",
        fields=(
            NoteField(key="name", label="Stat", column="title"),
            # Free text rather than numbers: a threshold is written "40",
            # "40/60" or "soft cap" depending on the game, and a numeric
            # column would refuse the last two.
            NoteField(key="min_value", label="Min"),
            NoteField(key="rec_value", label="Rec"),
            NoteField(key="softmax_value", label="Soft cap"),
            NoteField(key="my_value", label="Mine", quick_edit=True),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
        ),
    ),
    NoteSection(
        key="skills",
        shape=SHAPE_STRUCTURED,
        label="技能 Skills",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="builds",
        fields=_named_thing_fields(),
    ),
    NoteSection(
        # One row is one whole build, and the five lists inside it are what
        # make it one: a build is its stats AND its armour AND its weapons,
        # not five rows that happen to share a name. Those lists are the
        # reason the `fields` blob exists - no column can hold a list of rows.
        key="builds_and_styles",
        shape=SHAPE_STRUCTURED,
        label="配裝&流派 Builds & Styles",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="builds",
        fields=(
            # Not in the request, and kept anyway: every existing row has one,
            # and a list of builds with nothing to call them cannot be read.
            NoteField(key="name", label="Build", column="title"),
            NoteField(
                key="stats",
                label="Stats",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="name", label="Stat"),
                    NoteField(key="min_value", label="Min"),
                    NoteField(key="rec_value", label="Rec"),
                ),
            ),
            NoteField(
                key="armor",
                label="Armor",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="body_part", label="Slot"),
                    NoteField(key="name", label="Name"),
                    NoteField(key="special", label="Special"),
                ),
            ),
            NoteField(
                key="weapons",
                label="Weapons",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="range_type", label="Range"),
                    NoteField(key="type", label="Type"),
                    NoteField(key="name", label="Name"),
                    NoteField(key="special", label="Special"),
                ),
            ),
            NoteField(
                key="items",
                label="Items",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="type", label="Type"),
                    NoteField(key="name", label="Name"),
                    NoteField(key="amount", label="Amount"),
                ),
            ),
            NoteField(
                key="skills",
                label="Skills",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="type", label="Type"),
                    NoteField(key="name", label="Name"),
                ),
            ),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
        ),
    ),
    NoteSection(
        # A party rather than a loadout: who is in it, what each one is FOR
        # (定位), and which build each runs. The build is free text and not a
        # pointer at a `builds_and_styles` row - a composition is often
        # written before those rows exist, and a reference that can dangle
        # buys nothing here.
        key="team_composition",
        shape=SHAPE_STRUCTURED,
        label="隊伍組成 Team Composition",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="builds",
        fields=(
            NoteField(key="name", label="Team", column="title"),
            NoteField(
                key="members",
                label="Members",
                type=FIELD_LIST,
                item_fields=(
                    NoteField(key="name", label="Name"),
                    NoteField(key="role", label="定位"),
                    NoteField(key="build", label="Build"),
                    NoteField(key="description", label="Notes"),
                ),
            ),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
        ),
    ),
    # --- 物品 Items & Gear ------------------------------------------------
    # What to get. Three lists that differ in what a row IS rather than in
    # what is known about it, which is why they share one spec and one card.
    NoteSection(
        key="weapons_and_gear",
        shape=SHAPE_STRUCTURED,
        label="武器&裝備 Weapons & Gear",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="gear",
        fields=_named_thing_fields(variant=True, collected=True),
    ),
    NoteSection(
        key="items",
        shape=SHAPE_STRUCTURED,
        label="道具 Items",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="gear",
        fields=_named_thing_fields(variant=True, collected=True),
    ),
    NoteSection(
        key="collectibles",
        shape=SHAPE_STRUCTURED,
        label="收集物 Collectibles",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="gear",
        fields=_named_thing_fields(variant=True, collected=True),
    ),
    # --- 圖鑑與名詞 Compendium & Terms ------------------------------------
    # Who you meet, and the words you meet: the game's own and the players'.
    # 結局 Endings is a story OUTCOME rather than a guide topic, so it sits in
    # 劇情 Story - which leaves this card cleanly about the cast, the bestiary
    # and the two glossaries.
    NoteSection(
        # NOT `characters`: a `character` table and a /character/:id page
        # already exist, and a bare `characters` note section would read as
        # related to them.
        #
        # No links, deliberately: a character note is about who they are, and
        # the walkthrough that covers them belongs in 攻略資源 Guide Resources.
        key="characters_guide",
        shape=SHAPE_STRUCTURED,
        label="角色 Characters",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="compendium",
        fields=(
            # `group` is what a character belongs TO - a faction, a party, a
            # house. Free text, so it declares no options.
            NoteField(key="group", label="Group", type=FIELD_SELECT, column="kind"),
            NoteField(key="name", label="Name", column="title"),
            NoteField(key="alias", label="Alias"),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
        ),
    ),
    NoteSection(
        key="enemies",
        shape=SHAPE_STRUCTURED,
        label="敵人 Enemies",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="compendium",
        fields=(
            # Free text: "boss", "small boss", "elite", "trash" are one game's
            # vocabulary and the next game's is a different one.
            NoteField(key="tier", label="Tier", type=FIELD_SELECT, column="kind"),
            NoteField(key="region", label="Region"),
            NoteField(key="name", label="Name", column="title"),
            NoteField(key="alias", label="Alias"),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            # Closed, unlike tier and group: this is a fact about my run, not
            # about the game, so the four values are the same everywhere.
            NoteField(
                key="beaten",
                label="Status",
                type=FIELD_SELECT,
                column="status",
                options=ENEMY_STATUSES,
                # Every enemy worth a row is one I have not beaten yet when I
                # write it down, so that is where a new row starts.
                default="to beat",
            ),
        ),
    ),
    NoteSection(
        # The game's own vocabulary - mechanics, currencies, jargon - as a
        # glossary. Its story counterpart is 劇情名詞 Story Terms: a word the
        # PLOT introduces is looked up while reading the story, not while
        # playing, so it sits in 世界觀 Worldbuilding.
        key="game_terms",
        shape=SHAPE_STRUCTURED,
        label="遊戲名詞 Game Terms",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="compendium",
        fields=_term_fields(),
    ),
    NoteSection(
        # The players' vocabulary rather than the game's: community slang,
        # abbreviations and memes ("cheese", "pity", "i-frames") that no menu
        # in the game uses. Beside 遊戲名詞 because both are looked up while
        # playing; separate because a reader who meets a word on a forum
        # wants the list the forum's words are in.
        key="player_terms",
        shape=SHAPE_STRUCTURED,
        label="玩家術語 Player Terms",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="compendium",
        fields=_term_fields(),
    ),
    # --- 劇情 Story -------------------------------------------------------
    # What happens, as opposed to what it means - 解析 Analysis, two cards up,
    # holds the second. Four strands: the main plot, the side stories, the
    # characters' arcs and how it ends. The world they happen in is 世界觀
    # Worldbuilding. This card is a wall of spoilers and the site has no
    # spoiler gate; the collapsible card is all today's UI offers.
    NoteSection(
        # Structured rather than episode_text so a beat can carry the video or
        # the write-up it came from. The chapter stays the `locator` column it
        # always was, and is still optional - unlike episode_comments and
        # highlight_moments, a beat remembered without its chapter number is
        # still a beat, whereas a per-chapter comment about nothing in
        # particular is not a per-chapter comment.
        key="main_plot",
        shape=SHAPE_STRUCTURED,
        label="主線劇情 Main Plot",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="story",
        fields=_plot_fields(),
    ),
    NoteSection(
        key="side_plot",
        shape=SHAPE_STRUCTURED,
        label="支線劇情 Side Stories",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="story",
        fields=_plot_fields(),
    ),
    NoteSection(
        key="character_arcs",
        shape=SHAPE_TEXT_LINKS,
        label="角色劇情 Character Arcs",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        # Entry order carries no meaning here - endings are a set, not a
        # sequence - but the rows still reorder, because "the one I am going
        # for first" is a reason to move one up that the data cannot express.
        key="endings",
        shape=SHAPE_STRUCTURED,
        label="結局 Endings",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="story",
        fields=(
            NoteField(key="name", label="Name", column="title"),
            NoteField(
                key="completion",
                label="Status",
                type=FIELD_SELECT,
                column="status",
                options=ENDING_STATUSES,
            ),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
        ),
    ),
    # --- 劇情列表 Story List ----------------------------------------------
    # Four sections rather than one with a kind, for the reason the 待辦
    # buckets below are four: `sort_index` orders rows within one
    # (owner, section) pair, so a kind-tagged single section could not order
    # entries within a strand.
    #
    # These are the first `hierarchical` sections. An entry nests under
    # another to any depth - a chapter holding scenes holding beats - which is
    # what `note.parent_id` was added for. Two or three levels is the expected
    # shape; nothing enforces a limit, because the limit would be arbitrary
    # and the router already refuses a cycle.
    #
    # `require_any` is the rule that makes an entry an entry: it needs an
    # order number OR a name. "3.2" with no name is a placeholder somebody
    # will fill in; "The Lake" with no number is an entry whose position is
    # its parent's business. Neither is worth refusing, and a row with
    # neither is nothing.
    *_story_list_sections(),
    # --- 世界觀 Worldbuilding --------------------------------------------
    # The world, its words, its chronology and its open questions - what the
    # plot stands on rather than what it does.
    NoteSection(
        key="lore",
        shape=SHAPE_TEXT_LINKS,
        label="設定 Lore",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="worldbuilding",
    ),
    NoteSection(
        # The story's own vocabulary - places, factions, events, invented
        # words - beside the lore it names. 設定 is prose about the
        # world; this is the index of its terms.
        key="story_terms",
        shape=SHAPE_STRUCTURED,
        label="劇情名詞 Story Terms",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="worldbuilding",
        fields=_term_fields(),
    ),
    NoteSection(
        # One ordered list of dated events. It was plain `text` on the
        # reasoning that a row wanting a link would mean it should have been
        # text_links - which is exactly what happened, so it is.
        key="timeline",
        shape=SHAPE_TEXT_LINKS,
        label="時間線 Timeline",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="worldbuilding",
    ),
    NoteSection(
        key="mysteries",
        shape=SHAPE_TEXT_LINKS,
        label="未解之謎 Mysteries",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="worldbuilding",
    ),
    NoteSection(
        # The overflow that keeps a stray story observation out of Analysis.
        # Here rather than in 劇情, which holds exactly its four strands.
        key="story_other",
        shape=SHAPE_TEXT_LINKS,
        label="其他 Other",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="worldbuilding",
    ),
    # --- 待辦 Todo --------------------------------------------------------
    # Four sections rather than one section with a kind, because ordering is
    # PER SECTION: sort_index orders rows within one (owner, section) pair and
    # PATCH /api/notes/reorder renumbers the whole section, so a kind-tagged
    # single section could not order items within a bucket. Moving an item
    # between buckets is therefore a PATCH of `section`, which the API already
    # accepts - no UI does it, and none does reorder either.
    #
    # Personal, not catalogue: a backlog is one person's. text_links so an item
    # can carry the guide link that prompted it.
    NoteSection(
        key="todo_now",
        shape=SHAPE_TEXT_LINKS,
        label="現在進行 Doing now",
        owners=GAME_OWNERS,
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_next",
        shape=SHAPE_TEXT_LINKS,
        label="接下來 To do next",
        owners=GAME_OWNERS,
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_later",
        shape=SHAPE_TEXT_LINKS,
        label="未來 To do in the future",
        owners=GAME_OWNERS,
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_maybe",
        shape=SHAPE_TEXT_LINKS,
        label="可能 Might do",
        owners=GAME_OWNERS,
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    # --- 音樂 Music -------------------------------------------------------
    # The five sections below form the music group, and the page renders that
    # run inside one card. They stay separate registry entries rather than one
    # section with an OP/ED/OST dropdown: a work has its own list of OP rows,
    # and folding the lists into one would make "which OPs do I still need?" a
    # filter rather than a section.
    NoteSection(
        key="op",
        shape=SHAPE_MUSIC_TRACK,
        label="OP",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=MUSIC_TYPES,
        default_kind="normal",
        statuses=MUSIC_STATUSES,
    ),
    NoteSection(
        key="ed",
        shape=SHAPE_MUSIC_TRACK,
        label="ED",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=MUSIC_TYPES,
        default_kind="normal",
        statuses=MUSIC_STATUSES,
    ),
    NoteSection(
        key="insert_songs",
        # An insert song with no episode is just a song: where it plays is what
        # makes it a note. Everything else is optional - a remembered scene
        # often comes before the title does.
        locator_required=True,
        shape=SHAPE_EPISODE_NAME_LINKS,
        label="插入曲 Insert Song",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        # The only tracking dropdown this section needs, and the same one OP,
        # ED and OST offer. There is no type: an insert song is whatever cut
        # plays in that episode, so "which version" has no answer separate from
        # the episode itself.
        statuses=MUSIC_STATUSES,
        locator_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        # Not a list of songs like OP and ED: an anime has ONE OST entry,
        # saying which cut and how far tracking it has got, and nothing else -
        # no song name, link or remark. Structured rather than music_track
        # because that shape always carries those three columns.
        key="ost",
        shape=SHAPE_STRUCTURED,
        label="OST",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        singleton=True,
        fields=(
            NoteField(
                key="type",
                label="Type",
                type=FIELD_SELECT,
                column="kind",
                options=MUSIC_TYPES,
                default="normal",
            ),
            NoteField(
                key="status",
                label="Status",
                type=FIELD_SELECT,
                column="status",
                options=MUSIC_STATUSES,
            ),
        ),
    ),
    NoteSection(
        key="op_ed_changes",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="OP/ED 變動",
        owners=("anime", "tv-show", "cartoon"),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=OP_ED_KINDS,
        locator_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="extended_episodes",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="加長",
        owners=("anime", "tv-show", "cartoon"),
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="adaptation",
        shape=SHAPE_TEXT_LINKS,
        label="改編 Adaptation",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "novel")
        + _SERIES_AND_UP,
        scope=SCOPE_CATALOG,
        desc_required=("anime", "anime-movie", "novel"),
    ),
    # --- 資源&工具 Tools & Resources ---------------------------------------
    # Things outside the game itself: somebody else's walkthrough, and the
    # mods and tools you run alongside it. A mod was never a guide - the
    # registry said so where `mods_and_tools` used to sit - and
    # `guide_resources` had no card of its own to be in, so pairing them gives
    # both a home.
    #
    # Immediately before the site-wide `resources` card it mirrors. Still
    # distinct in key AND label: two cards reading "Resources" on one page
    # would be unreadable.
    NoteSection(
        # Where `builds_and_mods`'s Mod and Tool rows went. A mod is not a
        # guide, so it is not folded into one of the sections above; Mod and
        # Tool stay one field on one section because they are the same shape.
        key="mods_and_tools",
        shape=SHAPE_STRUCTURED,
        label="模組&工具 Mods & Tools",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="tools",
        fields=(
            # Carried over from the section's old `kinds` dropdown, which
            # every existing row is tagged with. Dropping it would throw that
            # away, and "is this a mod or a tool" is still the first thing
            # somebody scanning the list wants to know.
            NoteField(
                key="type",
                label="Type",
                type=FIELD_SELECT,
                column="kind",
                options=MOD_KINDS,
            ),
            NoteField(key="name", label="Name", column="title"),
            NoteField(key="developer", label="Developer"),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            NoteField(
                key="status",
                label="Status",
                type=FIELD_SELECT,
                column="status",
                options=MOD_STATUSES,
            ),
        ),
    ),
    NoteSection(
        # A pointer to somebody else's walkthrough. It sat inside the 攻略
        # group while that group WAS the guide; now that the thirteen
        # sections above hold the guide's content, a list of other people's
        # guides is a different kind of thing - it is where the guide came
        # from, not part of it.
        #
        # So it stands on its own, immediately before the site-wide
        # `resources` card it mirrors. Deliberately NOT keyed or labelled
        # `resources`: two cards reading "Resources" on one page would be
        # unreadable, which is why the keys and the labels both differ.
        #
        # Order carries no meaning, so its rows are appended and left alone.
        key="guide_resources",
        shape=SHAPE_STRUCTURED,
        label="攻略資源 Guide Resources",
        owners=GAME_OWNERS,
        scope=SCOPE_CATALOG,
        group="tools",
        fields=(
            NoteField(key="name", label="Name", column="title"),
            NoteField(
                key="description",
                label="Description",
                type=FIELD_TEXTAREA,
                column="content",
            ),
            NoteField(key="links", label="Links", type=FIELD_LINKS, column="links"),
        ),
    ),
    NoteSection(
        key="resources",
        shape=SHAPE_NAME_LINKS,
        label="Resources",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        standalone=True,
    ),
    NoteSection(
        key="questions",
        shape=SHAPE_EPISODE_TEXT,
        label="Questions",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        # The locator here is not an episode: it is whatever prompted the
        # question - an episode, a scene, an interview. Optional, because
        # plenty of questions are about the work as a whole.
        locator_placeholder="Source, e.g. ep 3",
        # The mirror of locator_required: a source with no question attached
        # says nothing, so the body is what cannot be missing.
        desc_required=ALL_OWNERS,
        standalone=True,
    ),
    NoteSection(
        key="quotes",
        shape=SHAPE_EXTERNAL,
        label="名言 Quotes",
        # A quote is said in a specific work, so it stays entry-only - see the
        # class docstring in app/models/quote.py.
        owners=ENTRY_OWNERS,
        # Universal: shared, unfiltered, no per-user copies. Backed by the
        # `quote` table, so there is no `note` row to scope.
        scope=None,
        group="quotes_memes",
    ),
    NoteSection(
        key="memes",
        shape=SHAPE_EXTERNAL,
        label="梗/迷因 Memes",
        # A running gag often spans a franchise, so meme already allows all ten.
        owners=ALL_OWNERS,
        # Universal, like quotes, and backed by the `meme` table.
        scope=None,
        group="quotes_memes",
    ),
)

_BY_KEY = {s.key: s for s in NOTE_SECTIONS}


def _check_group_by(section: NoteSection) -> None:
    """A section's `group_by` must name one of its own `names` fields."""
    if section.group_by is None:
        return
    target = next((f for f in section.fields if f.key == section.group_by), None)
    if target is None or target.type != FIELD_NAMES or target.column:
        raise ValueError(
            f"Section '{section.key}' groups by '{section.group_by}', which is "
            "not one of its `names` fields."
        )


for _section in NOTE_SECTIONS:
    _check_group_by(_section)

PERSONAL_SECTIONS: frozenset[str] = frozenset(
    s.key for s in NOTE_SECTIONS if s.scope == SCOPE_PERSONAL
)
CATALOG_SECTIONS: frozenset[str] = frozenset(
    s.key for s in NOTE_SECTIONS if s.scope == SCOPE_CATALOG
)


def sections_by_scope(scope: str) -> list[NoteSection]:
    """Every section of one scope, in display order."""
    return [s for s in NOTE_SECTIONS if s.scope == scope]


def section_by_key(key: str) -> NoteSection | None:
    """The section with this key, or None if it is not a known section."""
    return _BY_KEY.get(key)


def sections_for(owner_type: str) -> list[NoteSection]:
    """Every section that applies to this owner type, in display order."""
    return [s for s in NOTE_SECTIONS if owner_type in s.owners]


def label_for(section: NoteSection, owner_type: str) -> str:
    """This section's label for this owner, falling back to the default."""
    return section.labels.get(owner_type, section.label)


def kinds_for(section: NoteSection, owner_type: str) -> tuple[str, ...]:
    """This section's allowed kinds for this owner, falling back to the default."""
    return section.kinds_by_owner.get(owner_type, section.kinds)


def group_for(section: NoteSection, owner_type: str) -> str | None:
    """This section's group for this owner, falling back to the default."""
    return section.groups_by_owner.get(owner_type, section.group)


def group_by_key(key: str) -> NoteGroup | None:
    """The group with this key, or None if it is not a known group."""
    return _GROUPS_BY_KEY.get(key)


def locator_for(section: NoteSection, owner_type: str) -> str | None:
    """This section's locator label for this owner, else the default."""
    return section.locator_placeholders.get(owner_type, section.locator_placeholder)


def fields_for(section: NoteSection) -> tuple[NoteField, ...]:
    """This section's field spec, empty for every non-structured shape."""
    return section.fields


def field_by_key(section: NoteSection, key: str) -> NoteField | None:
    """One field of a structured section, or None if it declares no such field."""
    for f in section.fields:
        if f.key == key:
            return f
    return None


def column_field_map(section: NoteSection) -> dict[str, NoteField]:
    """The section's column-backed fields, keyed by the column they claim."""
    return {f.column: f for f in section.fields if f.column}


def json_fields(section: NoteSection) -> tuple[NoteField, ...]:
    """The section's fields stored inside the `fields` JSONB blob."""
    return tuple(f for f in section.fields if not f.column)
