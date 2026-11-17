// Frontend: page component file for BookNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function BookNotes({ book, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="book"
      ownerId={book.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
