// Frontend: page component file for HComicNotes.
//
// The notes page for one h-comic. Beyond the other types' wrappers it hands
// the notes page three things the 亮點 Highlights section reads: the entry row
// (its `owner_where` is KR only, so a JP page draws no card), the cast's
// names for the `names` inputs, and the entry's stored group order with the
// callback that saves a new one.
import NotesTemplate from "../notes/NotesTemplate";

export default function HComicNotes({
  hComic,
  isAdmin,
  hideSections,
  nameSuggestions,
  onGroupOrderChange,
}) {
  return (
    <NotesTemplate
      ownerType="h-comic"
      ownerId={hComic.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
      owner={hComic}
      nameSuggestions={nameSuggestions}
      groupOrder={hComic.highlight_group_order}
      onGroupOrderChange={onGroupOrderChange}
    />
  );
}
