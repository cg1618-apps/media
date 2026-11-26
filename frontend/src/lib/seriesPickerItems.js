// Frontend: the loaded series as the items every entry form's Series picker
// (FamilyLineageFields) chooses from.
//
// Each item carries its parent's id as `franchiseId`, because the picker
// narrows by it: to the picked franchise's series once one is picked, and
// before that to the series under a franchise the type's rule offers.
import { getDisplayName } from "../utils/media";

export function seriesPickerItems(allSeries = []) {
  return allSeries.map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
    franchiseId: s.franchise_id,
  }));
}
