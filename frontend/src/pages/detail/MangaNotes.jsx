// Frontend: page component file for MangaNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MangaNotes({ manga, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="manga"
      ownerId={manga.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
