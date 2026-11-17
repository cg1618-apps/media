// Frontend: page component file for MovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MovieNotes({ movie, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="movie"
      ownerId={movie.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
