// The seven person types, shared by the admin Modify / Delete pages and the
// person library so they cannot drift apart — the same job OptionSubTabBar
// does for the System Option tab.
//
// The sub-tab filters WHICH PEOPLE ARE LISTED, which is why the Add page has
// no bar: there is nothing to filter, and the role × scope matrix in the form
// already says which types the new person holds. It deliberately does not
// scope the form either: a person is one row and may hold several types, so
// the person editor always shows their full role × scope matrix.
//
// The keys are the collapsed person-role vocabulary in
// app/utils/credit_roles.py. A new type added there needs a line here —
// this list is hand-maintained, and the seiyuu row below was missed for a
// while precisely because nothing fails when it is out of date.
import { useAuth } from "../../contexts/AuthContext";
import { visibleByType } from "../../lib/gatedTypes";

export const PERSON_SUB_TABS = [
  { key: "director", label: "Director", icon: "fa-clapperboard" },
  { key: "producer", label: "Producer", icon: "fa-briefcase" },
  { key: "composer", label: "Music / Composer", icon: "fa-music" },
  { key: "author", label: "Author", icon: "fa-pen-nib" },
  { key: "illustrator", label: "Illustrator", icon: "fa-paintbrush" },
  // A club is a person scoped to the gated h-comic type only. For a session
  // that cannot see h-comic every club is hidden, so the tab is not drawn at
  // all (canSeeGatedType): an always-empty Club tab would still say the
  // type exists.
  { key: "club", label: "Club", icon: "fa-people-group", gatedType: "h-comic" },
  // Seiyuu hold no media_credit rows - their work lives in character_casting -
  // but they are people like any other, so they get a sub-tab like any other.
  { key: "seiyuu", label: "Seiyuu 聲優", icon: "fa-microphone" },
];

export default function PersonSubTabBar({ active, onSelect }) {
  const tabs = visibleByType(useAuth(), PERSON_SUB_TABS, (t) => t.gatedType);
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
          <i className={`fas ${t.icon}`}></i>
          {t.label}
        </button>
      ))}
    </div>
  );
}
