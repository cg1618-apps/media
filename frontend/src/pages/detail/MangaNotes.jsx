// Frontend: page component file for MangaNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MangaNotes({ manga, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="manga"
      ownerId={manga.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
