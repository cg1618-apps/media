// The row of media-type chips that narrows an admin entity list to the
// records in any of the ticked scopes. None ticked means any scope, so the
// list starts unfiltered. Fewer than two choices draws nothing: a single chip
// could only ever select everyone already listed.
//
// What "in scope" means is the caller's - a person's (role, scope) rows, a
// publisher's stored scopes, the media types a studio is credited on or a
// character is cast in - and lib/entityScopes.js holds those readings.
export default function ScopeChips({ choices, selected, onToggle }) {
  if (choices.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider mr-1">
        Scope
      </span>
      {choices.map((scope) => (
        <button
          key={scope}
          type="button"
          onClick={() => onToggle(scope)}
          className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
            selected.includes(scope)
              ? "bg-brand text-on-brand border-brand"
              : "bg-surface text-text-faint border-border hover:border-border-strong"
          }`}
        >
          {scope}
        </button>
      ))}
    </div>
  );
}
