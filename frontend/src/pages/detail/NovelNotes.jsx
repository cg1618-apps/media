// Frontend: page component file for NovelNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function NovelNotes({ novel, isAdmin, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="novel"
      ownerId={novel.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
