// Frontend: a character's identities as a ribbon at the top of a Modify
// editor, drawn like FranchiseRibbon's "Other entries in this franchise".
//
// The identity editor lists the character's OTHER identities, each a chip that
// opens that identity's editor (`onOpen`); the character editor lists every
// identity the character has, as plain chips - not links, since leaving the
// character's form would drop its unsaved edits. Nothing is drawn when there
// is nothing to list.
export default function IdentityRibbon({ identities, excludeId, title, onOpen }) {
  const shown = (identities || [])
    .filter((i) => i.system_id !== excludeId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (!shown.length) return null;

  const chipCls =
    "flex items-center gap-1.5 px-3 py-1 bg-surface border border-border rounded-full text-xs font-bold text-text-muted";
  const name = (i) => i.display_name || "Unknown";

  return (
    <div
      role="region"
      aria-label={title}
      className="mb-5 bg-surface-2 border border-border rounded-xl px-4 py-3 space-y-3 max-h-64 overflow-y-auto"
    >
      <p className="sticky top-0 z-10 -mx-4 -mt-3 bg-canvas px-4 pt-3 pb-1 text-[10px] font-black text-text-faint">
        {title}
      </p>
      <div className="flex gap-2 flex-wrap">
        {shown.map((i) =>
          onOpen ? (
            <button
              key={i.system_id}
              type="button"
              onClick={() => onOpen(i)}
              className={`${chipCls} hover:border-brand hover:text-brand transition`}
            >
              {name(i)}
            </button>
          ) : (
            <span key={i.system_id} className={chipCls}>
              {name(i)}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
