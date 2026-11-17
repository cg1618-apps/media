// Frontend: page component file for AnimeMovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeMovieNotes({ movie, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="anime-movie"
      ownerId={movie.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
