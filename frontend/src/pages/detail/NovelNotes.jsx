// Frontend: page component file for NovelNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function NovelNotes({ novel, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="novel"
      ownerId={novel.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
