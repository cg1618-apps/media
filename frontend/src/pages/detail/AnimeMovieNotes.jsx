// Frontend: page component file for AnimeMovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeMovieNotes({ movie, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="anime-movie"
      ownerId={movie.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
