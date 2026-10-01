// The underlined tab strip that splits an admin entity list by type: the
// person types (PersonSubTabBar) and the character roles on the Modify and
// Delete pages. It filters which records are LISTED, never the editor - an
// entity is one row, and its form always shows everything it holds.
export default function SubTabBar({ tabs, active, onSelect }) {
  return (
    <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px transition ${
            active === t.key
              ? "border-brand text-brand"
              : "border-transparent text-text-faint hover:text-text-muted"
          }`}
        >
          {t.icon && <i className={`fas ${t.icon}`}></i>}
          {t.label}
        </button>
      ))}
    </div>
  );
}
