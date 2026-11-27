// Frontend: read-only inventory of every choice list in the app, in four
// tiers:
//
//   Tier 1  Internal Keys   closed enums in code (served by /api/constants)
//                           and the entity records that replaced option
//                           categories (person, studio, publisher, character)
//   Tier 2  System Options  system_option categories edited on the Options
//                           sub-tab of Add / Modify
//   Tier 3  Tags            the categories of the Tags sub-tab
//   Tier 4  Common Options  the categories of the Common Options sub-tab
//
// Tiers 2-4 are one table, system_option, split the way the Add / Modify
// sub-tabs split it (lib/optionCategoryGroups.js), so the page and the forms
// agree on where a category lives without either listing category names.
//
// This page never writes. Each tier says where its lists are edited.
//
// A system_option value may also carry alias rows - what an external API
// calls it. Those are a lookup, not a vocabulary, so they have their own view
// on /aliases (pages/admin/Aliases.jsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { scopeChip, usageChip } from "../../config/scopeColors";
import { useConstants } from "../../config/useConstants";
import { groupOptionTiers, groupTier1Keys } from "../../lib/optionsPageGroups";

// The entity records under Internal Keys: what each stores, and which
// system_option categories it replaced. The notes name no gated type: the club
// row is drawn only when the server counts it, which it does only for a
// session that may see the type it belongs to. Mirrors the Entities table in
// docs/options.md - keep the two in step.
//
// A row is one LIVE role, not one old category: Manga Author, Novel Author and
// Comic Writer all became `author`, and /api/options/record-counts tallies per
// role, so a row per old category would print one author total three times.
export const ENTITY_ROWS = [
  {
    record: "Studio",
    home: "studio",
    countKey: "studios",
    replaced: ["Studio"],
    detail: "credited via media_credit role studio; a game's developer is its studio",
  },
  {
    record: "Publisher",
    home: "publisher",
    countKey: "publishers",
    replaced: ["Publisher / Distributor TW", "Comic Publisher"],
    detail:
      "offered per media type through publisher_scope. Reads 台灣代理商 on anime, 台灣出版社 on manga and book, 出版商 on comic, 發行商 on game",
  },
  {
    record: "Director",
    home: "person",
    roleKey: "director",
    replaced: ["Director"],
    detail: "scoped by media type on person_role",
  },
  {
    record: "Producer",
    home: "person",
    roleKey: "producer",
    replaced: ["Producer"],
    detail: "scoped by media type on person_role",
  },
  {
    record: "Music / Composer",
    home: "person",
    roleKey: "composer",
    replaced: ["Music / Composer"],
    detail: "scoped by media type on person_role",
  },
  {
    record: "Author",
    home: "person",
    roleKey: "author",
    replaced: ["Manga Author", "Novel Author", "Comic Writer"],
    detail: "原作 on manga, Author on a book, Writer on a comic",
  },
  {
    record: "Illustrator",
    home: "person",
    roleKey: "illustrator",
    replaced: ["Manga Author", "Novel Illustrator", "Comic Artist"],
    detail: "作畫 on manga, Illustrator on a book, Artist on a comic",
  },
  {
    record: "Club",
    home: "person",
    roleKey: "club",
    replaced: [],
    detail: "a circle; artists belong to it through person_membership",
  },
  {
    record: "Seiyuu",
    home: "person",
    roleKey: "seiyuu",
    replaced: [],
    detail: "reaches an entry through the character voiced (character_casting), not media_credit",
  },
  {
    record: "Character",
    home: "character",
    countKey: "characters",
    replaced: [],
    detail: "cast on entries through character_casting; an identity is a character_identity row",
  },
];

// Two enums knowingly disagree with their Enum class in Python. The page
// serves what /api/constants serves, so it flags the split rather than letting
// it look like a bug. See "Known discrepancies" in docs/options.md.
const TIER1_NOTES = {
  franchise_type:
    "Diverges from the FranchiseType Enum, which lacks Anime Movie. Preserved, not resolved.",
  anime_airing_type:
    "Carries a trailing Other that the AnimeAiringType Enum lacks. Preserved, not resolved.",
};

const ENTITIES_TITLE = "Entities";

// "Source & Platform" -> "source-platform", for fragment ids.
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Anchor id for a group heading. Prefixed by tier, because two tiers can each
// end in a group called "Other".
function groupId(tierId, title) {
  return `${tierId}-group-${slug(title)}`;
}

// Anchor id for one category. /aliases links here, through the same rule.
function categoryId(category) {
  return `opt-${slug(category)}`;
}

// snake_case key -> the heading an admin recognises.
function prettifyKey(key) {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// The left title bar: an index of the tiers and their group headings - not
// every card and table, which would run taller than the viewport. Plain
// fragment links: the browser scrolls (scroll-mt-28 clears the sticky nav) and
// the URL keeps the section.
function TitleBar({ tiers, activeId }) {
  const listRef = useRef(null);
  const activeRef = useRef(null);

  // Keep the highlighted entry inside the bar's own scroll box, by hand rather
  // than with scrollIntoView, which would also scroll the page.
  useEffect(() => {
    const box = listRef.current;
    const link = activeRef.current;
    if (!box || !link) return;
    // Rect deltas, not offsetTop: the sticky bar is the links' offsetParent.
    const top =
      link.getBoundingClientRect().top -
      box.getBoundingClientRect().top +
      box.scrollTop;
    const bottom = top + link.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [activeId]);

  const linkClass = (id) =>
    `block truncate rounded px-2 py-1 text-xs font-semibold transition ${
      activeId === id
        ? "bg-ink text-ink-text"
        : "text-text-faint hover:bg-surface-2 hover:text-text"
    }`;
  const linkProps = (id) => ({
    href: `#${id}`,
    className: linkClass(id),
    ref: activeId === id ? activeRef : undefined,
  });

  return (
    <aside className="hidden lg:block w-60 shrink-0">
      <nav
        aria-label="Section index"
        ref={listRef}
        className="sticky top-28 max-h-[calc(100vh-9rem)] overflow-y-auto bg-surface border border-border rounded-2xl shadow-sm p-4"
      >
        <p className="text-[10px] font-black text-text-faint px-2 mb-3">
          On this page
        </p>
        {tiers.map((tier) => (
          <div key={tier.id}>
            <a {...linkProps(tier.id)}>
              Tier {tier.number} · {tier.title}
            </a>
            <div className="ml-2 border-l border-border pl-2 mt-1 mb-3">
              {tier.groups.length === 0 ? (
                <span className="block px-2 py-1 text-xs text-text-faint/60">—</span>
              ) : (
                tier.groups.map((g) => (
                  <a key={g.title} {...linkProps(groupId(tier.id, g.title))}>
                    {g.title}
                  </a>
                ))
              )}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function ReadOnlyNote({ children }) {
  return (
    <p className="text-xs text-warning bg-warning/15 border border-warning/40 rounded-lg px-3 py-2 mt-3 inline-flex items-center gap-2">
      <i className="fas fa-lock"></i>
      <span>{children}</span>
    </p>
  );
}

function TierSection({ tier, note, children }) {
  return (
    <section
      id={tier.id}
      data-section-anchor
      className="scroll-mt-28 bg-surface rounded-2xl border border-border shadow-sm p-6"
    >
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="bg-ink text-ink-text text-[10px] font-black px-2.5 py-1 rounded">
            Tier {tier.number}
          </span>
          <h2 className="text-xl font-black text-text tracking-tight">{tier.title}</h2>
          <code className="text-xs font-mono text-text-faint">{tier.source}</code>
        </div>
        <ReadOnlyNote>{note}</ReadOnlyNote>
      </div>
      {children}
    </section>
  );
}

function GroupHeading({ id, title, count }) {
  return (
    <div id={id} data-section-anchor className="scroll-mt-28 flex items-baseline gap-2 mb-3">
      <h3 className="text-xs font-black text-text">{title}</h3>
      <span className="text-[10px] font-bold text-text-faint">{count}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

function ValueChip({ children }) {
  return (
    <span className="inline-block bg-surface-2 border border-border text-text-muted text-xs font-semibold rounded px-2 py-1">
      {children}
    </span>
  );
}

function EnumCard({ enumKey, values }) {
  return (
    <div
      id={`enum-${enumKey}`}
      className="scroll-mt-28 border border-border rounded-xl p-4 flex flex-col"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h4 className="text-sm font-black text-text">{prettifyKey(enumKey)}</h4>
        <span className="text-[10px] font-bold text-text-faint">{values.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <ValueChip key={value}>{value}</ValueChip>
        ))}
      </div>
      {TIER1_NOTES[enumKey] && (
        <p className="text-[11px] text-warning mt-3 leading-snug">
          <i className="fas fa-triangle-exclamation mr-1"></i>
          {TIER1_NOTES[enumKey]}
        </p>
      )}
    </div>
  );
}

const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function EntitiesTable({ counts, loading, personRoles }) {
  // A role the server does not count exists only for a gated type this
  // session cannot see (club), so it is not drawn at all. Until the counts
  // arrive, the served person_role list - viewer-scoped the same way - decides.
  const known = loading ? new Set(personRoles) : new Set(Object.keys(counts.person_roles));
  const rows = ENTITY_ROWS.filter((row) => !row.roleKey || known.has(row.roleKey));
  const recordCount = (row) =>
    row.roleKey ? (counts.person_roles[row.roleKey] ?? 0) : (counts[row.countKey] ?? 0);
  return (
    <div className="overflow-x-auto border border-border rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-[10px] text-text-faint">
          <tr>
            <th className="text-left font-black px-3 py-2">Record</th>
            <th className="text-left font-black px-3 py-2">Table</th>
            <th className="text-left font-black px-3 py-2">Replaced categories</th>
            <th className="text-left font-black px-3 py-2">Notes</th>
            <th className="text-right font-black px-3 py-2 w-24">Records</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.roleKey ?? row.home}>
              <td className="px-3 py-2 font-semibold text-text">{row.record}</td>
              <td className="px-3 py-2">
                <code className="text-xs font-mono text-text-muted">
                  {row.home}
                  {row.roleKey ? ` · ${row.roleKey}` : ""}
                </code>
              </td>
              <td className="px-3 py-2 text-xs text-text-muted">
                {row.replaced.length ? row.replaced.join(" · ") : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-text-faint">{row.detail}</td>
              <td className="px-3 py-2 text-right font-black text-text">
                {loading ? "…" : recordCount(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InternalKeys({ tier, constants, counts, countsLoading }) {
  return (
    <TierSection
      tier={tier}
      note={
        <>
          Fixed in code: not editable anywhere in the app, and changing a value is a
          code change. Entity records are added and edited on their own tabs of{" "}
          <Link to="/add" className="underline font-bold">
            Add
          </Link>{" "}
          and{" "}
          <Link to="/modify" className="underline font-bold">
            Modify
          </Link>
          .
        </>
      }
    >
      <div className="space-y-7">
        {tier.groups.map((group) => (
          <div key={group.title}>
            <GroupHeading
              id={groupId(tier.id, group.title)}
              title={group.title}
              count={
                group.keys
                  ? countLabel(group.keys.length, "list", "lists")
                  : countLabel(ENTITY_ROWS.length, "kind", "kinds")
              }
            />
            {group.keys ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {group.keys.map((key) => (
                  <EnumCard key={key} enumKey={key} values={constants[key]} />
                ))}
              </div>
            ) : (
              <EntitiesTable
                counts={counts}
                loading={countsLoading}
                personRoles={constants.person_role || []}
              />
            )}
          </div>
        ))}
      </div>
    </TierSection>
  );
}

function CategoryTable({ category, rows }) {
  return (
    <div id={categoryId(category)} className="scroll-mt-28">
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className="text-sm font-black text-text">{category}</h4>
        <span className="text-[10px] font-bold text-text-faint">
          {countLabel(rows.length, "value", "values")}
        </span>
      </div>
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-[10px] text-text-faint">
            <tr>
              <th className="text-left font-black px-3 py-2 w-16">#</th>
              <th className="text-left font-black px-3 py-2">Value</th>
              <th className="text-left font-black px-3 py-2">Scopes</th>
              <th className="text-left font-black px-3 py-2">Usages</th>
              <th className="text-left font-black px-3 py-2">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.system_id}>
                <td className="px-3 py-2 text-text-faint font-mono text-xs">{row.sort_order}</td>
                <td className="px-3 py-2 font-semibold text-text">{row.value}</td>
                <td className="px-3 py-2">
                  {row.scopes.length === 0 ? (
                    <span className="text-xs text-text-faint italic">everywhere</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {row.scopes.map((scope) => (
                        <span key={scope} className={scopeChip(scope)}>
                          {scope}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {(row.usages || []).length === 0 ? (
                    <span className="text-xs text-text-faint italic">both</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {row.usages.map((usage) => (
                        <span key={usage} className={usageChip(usage)}>
                          {usage}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-text-faint">{row.remark || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionTier({ tier, subTabLabel, note, byCategory, loading }) {
  return (
    <TierSection
      tier={tier}
      note={
        <>
          View only here. Edited on the {subTabLabel} sub-tab of System → System
          Option on{" "}
          <Link to="/add" className="underline font-bold">
            Add
          </Link>{" "}
          or{" "}
          <Link to="/modify" className="underline font-bold">
            Modify
          </Link>
          .{note}
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-text-faint font-medium">Loading options…</p>
      ) : tier.groups.length === 0 ? (
        <p className="text-sm text-text-faint font-medium">No values recorded.</p>
      ) : (
        <div className="space-y-7">
          {tier.groups.map((group) => (
            <div key={group.title}>
              <GroupHeading
                id={groupId(tier.id, group.title)}
                title={group.title}
                count={countLabel(group.categories.length, "category", "categories")}
              />
              <div className="space-y-6">
                {group.categories.map((category) => (
                  <CategoryTable
                    key={category}
                    category={category}
                    rows={byCategory.get(category)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </TierSection>
  );
}

const NO_COUNTS = { person_roles: {}, studios: 0, publishers: 0, characters: 0 };

export default function SystemOptions() {
  // The enums arrive through the hook the whole app uses, so this page can
  // never show a different list than the dropdowns do. It also fills
  // TAG_CATEGORIES and COMMON_OPTION_CATEGORIES, which decide the tier split.
  const constants = useConstants();

  const [options, setOptions] = useState([]);
  const [counts, setCounts] = useState(NO_COUNTS);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);

  useEffect(() => {
    // limit=5000 is the endpoint's ceiling. The default 1000 would silently
    // truncate an inventory page, which is the one place that must be whole.
    fetch(buildUrl(endpoints.options.list(), { limit: 5000 }), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setOptionsLoading(false));

    // The page's own manage.options read: the admin reaches this page holding
    // none of the entity view keys.
    fetch(endpoints.options.recordCounts(), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : NO_COUNTS))
      .catch(() => NO_COUNTS)
      .then((c) => setCounts({ ...NO_COUNTS, ...c }))
      .finally(() => setCountsLoading(false));
  }, []);

  // The endpoint sorts by category, then sort_order, then value, so bucketing
  // in arrival order keeps each category's dropdown order.
  const byCategory = useMemo(() => {
    const map = new Map();
    options.forEach((option) => {
      if (!map.has(option.category)) map.set(option.category, []);
      map.get(option.category).push(option);
    });
    return map;
  }, [options]);

  // Derived once, so the title bar and the content never disagree about what
  // exists or in what order. `constants` is a dependency because the tier
  // split reads the category lists it fills.
  const tiers = useMemo(() => {
    const split = groupOptionTiers([...byCategory.keys()]);
    return [
      {
        id: "tier-1",
        number: 1,
        title: "Internal Keys",
        source: "app/utils/constants.py · entity tables",
        groups: [
          ...groupTier1Keys(Object.keys(constants || {})),
          { title: ENTITIES_TITLE },
        ],
      },
      {
        id: "tier-2",
        number: 2,
        title: "System Options",
        source: "system_option",
        groups: split.options,
      },
      { id: "tier-3", number: 3, title: "Tags", source: "system_option", groups: split.tags },
      {
        id: "tier-4",
        number: 4,
        title: "Common Options",
        source: "system_option",
        groups: split.common,
      },
    ];
  }, [constants, byCategory]);

  // Which title-bar entry to highlight: the last anchor whose top has passed
  // under the sticky nav. A scroll handler rather than an IntersectionObserver,
  // because a group of tables can be several screens tall. Only the tiers and
  // their group headings carry [data-section-anchor] - exactly the entries the
  // index links to.
  const [activeId, setActiveId] = useState("tier-1");
  useEffect(() => {
    let frame = 0;

    function recompute() {
      frame = 0;
      const targets = document.querySelectorAll("[data-section-anchor]");
      let current = targets[0]?.id;
      for (const target of targets) {
        // 120px ~= the two-row sticky nav plus a hair, matching scroll-mt-28.
        if (target.getBoundingClientRect().top > 120) break;
        current = target.id;
      }
      if (current) setActiveId(current);
    }

    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(recompute);
    }

    // A fragment jump fires hashchange but no scroll event.
    function onHashChange() {
      const id = window.location.hash.slice(1);
      if (id) setActiveId(id);
    }

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", onHashChange);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [tiers]);

  const [internal, systemOptions, tags, common] = tiers;

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <h1 className="text-3xl font-black text-text tracking-tight">System Options</h1>
        <Link
          to="/system"
          className="bg-surface border border-border-strong text-text-muted px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-surface-2 transition shadow-sm flex items-center self-start"
        >
          <i className="fas fa-arrow-left mr-2 text-text-faint"></i> Back to Admin
        </Link>
      </div>

      {/* No items-start: the aside must stretch to the row's full height, or
          the sticky nav runs out of track after one screen. */}
      <div className="flex gap-8">
        <TitleBar tiers={tiers} activeId={activeId} />

        <div className="flex-1 min-w-0 space-y-8">
          <InternalKeys
            tier={internal}
            constants={constants}
            counts={counts}
            countsLoading={countsLoading}
          />
          <OptionTier
            tier={systemOptions}
            subTabLabel="Options"
            byCategory={byCategory}
            loading={optionsLoading}
            note={
              <>
                {" "}
                The names external APIs know a value by are on{" "}
                <Link to="/aliases" className="underline font-bold">
                  Alias Conversion
                </Link>
                .
              </>
            }
          />
          <OptionTier
            tier={tags}
            subTabLabel="Tags"
            byCategory={byCategory}
            loading={optionsLoading}
            note={null}
          />
          <OptionTier
            tier={common}
            subTabLabel="Common Options"
            byCategory={byCategory}
            loading={optionsLoading}
            note=" A common option's scope is its category's, set when the value is added."
          />
        </div>
      </div>
    </div>
  );
}
