// Frontend: the franchise and series pickers of a gated type's form.
//
// A gated type's entry sits only in a franchise of its own FAMILY
// (lib/gatedTypes.js inFranchiseFamily): the server refuses (422) any other,
// so the picker offers no other. H-Comic and Hentai are one family, so an
// h-comic and its hentai adaptation can share a franchise the way a manga and
// its anime do. Typing a name that matches nothing creates a franchise of the
// caller's own type on save; the page does that, not this component.
import ComboBox from "./ComboBox";
import { CollectionNote, Field } from "./FormField";
import { inFranchiseFamily } from "../../lib/gatedTypes";
import { getDisplayName } from "../../utils/media";

export default function FamilyLineageFields({
  f,
  u,
  family,
  hint,
  allFranchises,
  seriesItems,
  franchiseCollections,
}) {
  const franchiseItems = allFranchises
    .filter((fr) => inFranchiseFamily(fr.franchise_type, family))
    .map((fr) => ({
      id: fr.system_id,
      label: getDisplayName(fr, "franchise"),
      searchText: [
        fr.franchise_name_en,
        fr.franchise_name_cn,
        fr.franchise_name_roman,
        fr.franchise_name_jp,
        fr.franchise_name_alt,
      ]
        .filter(Boolean)
        .join(" "),
    }));

  // Picking or retyping the franchise drops the series: a series names its
  // parent, so one chosen under the old franchise would not belong.
  const setFranchise = (id, text) => {
    u("franchise_id", id);
    u("franchise_text", text);
    u("series_id", null);
    u("series_text", "");
  };

  return (
    <>
      <Field label="Franchise" hint={hint}>
        <ComboBox
          items={franchiseItems}
          selectedId={f.franchise_id}
          inputText={f.franchise_text}
          onSelect={(id, label) => setFranchise(id, label)}
          onType={(t) => setFranchise(null, t)}
          onClear={() => setFranchise(null, "")}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote franchiseId={f.franchise_id} franchiseCollections={franchiseCollections} />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItems}
          selectedId={f.series_id}
          inputText={f.series_text}
          onSelect={(id, label) => {
            u("series_id", id);
            u("series_text", label);
          }}
          onType={(t) => {
            u("series_text", t);
            u("series_id", null);
          }}
          onClear={() => {
            u("series_id", null);
            u("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
    </>
  );
}
