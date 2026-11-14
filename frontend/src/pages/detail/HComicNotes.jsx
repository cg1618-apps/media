// Frontend: page component file for HComicNotes.
//
// The notes page for one h-comic. Beyond the other types' wrappers it hands
// the notes page three things the 亮點 Highlights section reads: the entry row
// (its `owner_where` is KR only, so a JP page draws no card), the cast's
// names for the `names` inputs, and the viewer's own group order with the
// callback that saves a new one - passed only to a holder of
// self.personal_notes, so nobody else is offered the reorder.
import NotesTemplate from "../notes/NotesTemplate";

export default function HComicNotes({
  hComic,
  hideSections,
  nameSuggestions,
  onGroupOrderChange,
  series,
  franchise,
}) {
  return (
    <NotesTemplate
      ownerType="h-comic"
      ownerId={hComic.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
      owner={hComic}
      nameSuggestions={nameSuggestions}
      groupOrder={hComic.highlight_group_order}
      onGroupOrderChange={onGroupOrderChange}
    />
  );
}
