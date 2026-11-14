// Frontend: page component file for GameNotes.
//
// The notes page for one game, for the Modify tab. Game.jsx does not use it:
// that page splits its notes around the layout with one NotesProvider, 待辦
// Todo in the Progress slip and everything else at the bottom.
import NotesTemplate from "../notes/NotesTemplate";

export default function GameNotes({ game, hideSections }) {
  return (
    <NotesTemplate
      ownerType="game"
      ownerId={game.system_id}
      hideSections={hideSections}
    />
  );
}
