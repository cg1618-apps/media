// Frontend: add tab page file for CollectionAddTab.
import EntryNameFields from "../../components/forms/EntryNameFields";
import MyRatingFields from "../../components/forms/MyRatingFields";
import { SectionHeader } from "../../components/forms/FormField";
import { useViewScope } from "../../hooks/useViewScope";

export { defaultCollection } from "../../config/formFactories";

export default function CollectionAddTab({ cf, uf }) {
  const { ownData } = useViewScope();
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-boxes-stacked" title="Titles & Naming" />
      <EntryNameFields f={cf} u={uf} prefix="collection" label="Collection" placeholders={{ en: "e.g. Marvel, Type-Moon" }} />

      {/* The viewer's own rating and expectation (self.list), saved through /api/me/ratings
          once the collection exists - see submitCollection in Add.jsx. */}
      {ownData && (
        <>
          <SectionHeader icon="fa-info-circle" title="Other Information" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MyRatingFields kind="collection" form={cf} update={uf} />
          </div>
        </>
      )}

      <p className="text-xs text-text-faint pt-2 border-t border-border">
        <i className="fas fa-info-circle mr-1"></i>
        A Collection groups related franchises. Assign franchises to it from the
        Franchise tab — the cover is then taken from a member franchise.
      </p>
    </div>
  );
}
