// Frontend: modify tab page file for CollectionModifyTab.
import EntryNameFields from "../../components/forms/EntryNameFields";
import MyRatingFields from "../../components/forms/MyRatingFields";
import { getDisplayName } from "../../utils/media";
import {
  Field,
  SectionHeader,
  selectCls,
} from "../../components/forms/FormField";

export default function CollectionModifyTab({
  cf,
  uf,
  allFranchises,
  editingItem,
}) {
  const collectionId = editingItem?.system_id;

  // The cover is chosen from the collection's member franchises, not from
  // every entry underneath them - a short, meaningful list.
  const memberFranchises = (allFranchises || [])
    .filter((f) => f.collection_id === collectionId)
    .sort((a, b) =>
      getDisplayName(a, "franchise").localeCompare(
        getDisplayName(b, "franchise"),
      ),
    );

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-boxes-stacked" title="Titles & Naming" />
      <EntryNameFields f={cf} u={uf} prefix="collection" label="Collection" />

      <SectionHeader icon="fa-info-circle" title="Other Information" />
      {/* The viewer's own rating and expectation (self.list), saved through /api/me/ratings
          after the collection itself - see saveCollection in Modify.jsx. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MyRatingFields kind="collection" form={cf} update={uf} />
        </div>

      <SectionHeader icon="fa-image" title="Cover" />
      <Field label="Main Cover">
        <select
          className={selectCls}
          value={cf.cover_franchise_id || ""}
          onChange={(e) => uf("cover_franchise_id", e.target.value || null)}
        >
          <option value="">— Auto (from first member) —</option>
          {memberFranchises.map((f) => (
            <option key={f.system_id} value={f.system_id}>
              {getDisplayName(f, "franchise")}
            </option>
          ))}
        </select>
        {memberFranchises.length === 0 && (
          <p className="text-xs text-text-faint mt-1">
            No franchises assigned to this collection yet. Assign one from the
            Franchise tab first.
          </p>
        )}
      </Field>
    </div>
  );
}
