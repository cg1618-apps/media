// Frontend: page component file for AnimeNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeNotes({ anime, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="anime"
      ownerId={anime.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
