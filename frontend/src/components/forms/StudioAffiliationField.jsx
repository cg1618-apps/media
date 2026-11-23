// Frontend: the person form's Affiliation field - the studios a person
// belongs to (person_affiliation), a seiyuu's agency as much as a director's
// studio.
//
// Picks by id, not by name: two studios may share a display name, and an
// affiliation is to one row. `value` is the chosen studios as {system_id,
// display_name} refs; the form sends their ids as `studio_ids` with the
// person. Only existing studios are offered - a studio is created on its own
// tab, not typed into being here.
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import ComboBox from "./ComboBox";

const NAME_FIELDS = ["name_en", "name_cn", "name_jp", "name_alt"];

export default function StudioAffiliationField({ value, onChange }) {
  const chosen = value || [];
  const { data: studios = [] } = useQuery({
    queryKey: ["studios-for-affiliation"],
    queryFn: () => fetchJson(endpoints.studio.list()),
    staleTime: 5 * 60 * 1000,
  });
  const taken = new Set(chosen.map((s) => s.system_id));
  const items = (Array.isArray(studios) ? studios : [])
    .filter((s) => !taken.has(s.system_id))
    .map((s) => ({
      id: s.system_id,
      label: s.display_name || "Unknown",
      searchText: [s.display_name, ...NAME_FIELDS.map((f) => s[f])]
        .filter(Boolean)
        .join(" "),
    }));

  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Affiliated studios">
          {chosen.map((s) => (
            <li
              key={s.system_id}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-surface-2 text-xs font-bold text-text"
            >
              {s.display_name}
              <button
                type="button"
                onClick={() => onChange(chosen.filter((x) => x.system_id !== s.system_id))}
                aria-label={`Remove ${s.display_name}`}
                className="text-text-faint hover:text-danger"
              >
                <i className="fas fa-times text-[10px]"></i>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ComboBox
        items={items}
        selectedId={null}
        inputText=""
        onSelect={(id) => {
          const studio = studios.find((s) => s.system_id === id);
          if (studio) {
            onChange([
              ...chosen,
              { system_id: studio.system_id, display_name: studio.display_name },
            ]);
          }
        }}
        onType={() => {}}
        onClear={() => {}}
        placeholder="Search a studio to add…"
      />
    </div>
  );
}
