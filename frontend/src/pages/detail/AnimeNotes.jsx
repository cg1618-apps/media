// Frontend: page component file for AnimeNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeNotes({ anime, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="anime"
      ownerId={anime.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
