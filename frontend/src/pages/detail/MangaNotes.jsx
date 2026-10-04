// Frontend: page component file for MangaNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MangaNotes({ manga, isAdmin, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="manga"
      ownerId={manga.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
