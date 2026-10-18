// The media tab row on the franchise and series hubs.
//
// Each row is [label, entries, offered]: the tab's label, the list it shows,
// and whether the page offers that type at all (default true). A tab appears
// when it is offered and its list holds something, and its count is that
// list's length - both read from the same row, so a tab cannot be added
// without its count.
export function buildMediaTabs(rows) {
  const shown = rows.filter(
    ([, entries, offered = true]) => offered && entries.length > 0,
  );
  const counts = new Map(
    shown.map(([label, entries]) => [label, entries.length]),
  );
  return {
    tabs: shown.map(([label]) => label),
    countOf: (tab) => counts.get(tab) ?? 0,
  };
}
