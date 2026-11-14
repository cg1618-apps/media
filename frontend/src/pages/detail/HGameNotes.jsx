// Frontend: page component file for HGameNotes.
//
// The notes page for one h-game, for the Modify tab. HGame.jsx does not use
// it: that page splits its notes around the layout with one NotesProvider, as
// Game.jsx does. It hands the notes page what the 亮點 Highlights section
// reads - the entry row, and the viewer's own group order with the callback
// that saves a new one. An h-game has no cast, so there are no name
// suggestions.
import NotesTemplate from "../notes/NotesTemplate";

export default function HGameNotes({
  hGame,
  hideSections,
  onGroupOrderChange,
}) {
  return (
    <NotesTemplate
      ownerType="h-game"
      ownerId={hGame.system_id}
      hideSections={hideSections}
      owner={hGame}
      groupOrder={hGame.highlight_group_order}
      onGroupOrderChange={onGroupOrderChange}
    />
  );
}
