// Frontend: page component file for TVShowNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function TVShowNotes({ show, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="tv-show"
      ownerId={show.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
