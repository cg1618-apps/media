// Frontend: page component file for MovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MovieNotes({ movie, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="movie"
      ownerId={movie.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
