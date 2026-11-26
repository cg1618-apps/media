// Frontend: add tab page file for SeriesAddTab.
import EntryNameFields from "../../components/forms/EntryNameFields";
import MyRatingFields from "../../components/forms/MyRatingFields";
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
} from "../../components/forms/FormField";
import { useViewScope } from "../../hooks/useViewScope";

export { defaultSeries } from "../../config/formFactories";

export default function SeriesAddTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
}) {
  const { ownData } = useViewScope();
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
      <Field label="Parent Franchise" required>
        <ComboBox
          items={franchiseItems}
          selectedId={sf.franchise_id}
          inputText={sf.franchise_text}
          onSelect={(id, label) => {
            us("franchise_id", id);
            us("franchise_text", label);
          }}
          onType={(text) => {
            us("franchise_text", text);
            us("franchise_id", null);
          }}
          onClear={() => {
            us("franchise_id", null);
            us("franchise_text", "");
          }}
          placeholder="Search existing franchises..."
        />
        <CollectionNote
          franchiseId={sf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <EntryNameFields f={sf} u={us} prefix="series" label="Series" />
      {/*
        Other Information holds only the viewer's own rating and expectation (self.list),
        saved through /api/me/ratings once the series exists - see
        submitSeries in Add.jsx. A series that does not exist yet has no
        entries to choose a Main Cover from, so that control lives on the
        Modify tab only, exactly as franchise's does. To Rewatch is absent
        for the same reason - it targets an entry group by system_id, which
        does not exist until save.
      */}
      {ownData && (
        <>
          <SectionHeader icon="fa-info-circle" title="Other Information" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MyRatingFields kind="series" form={sf} update={us} />
          </div>
        </>
      )}
    </div>
  );
}
