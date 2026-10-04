// Frontend: page component file for AnimeMovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeMovieNotes({ movie, isAdmin, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="anime-movie"
      ownerId={movie.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
