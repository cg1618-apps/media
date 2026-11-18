// Frontend: page component file for ComicNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function ComicNotes({ comic, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="comic"
      ownerId={comic.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
