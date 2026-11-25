// Frontend: the admin toolbar's Mark completed button, shared by every media
// detail page. It is drawn only while the entry is unfinished by its type's
// own status field (isCompleted, over MEDIA_CONFIG[type].statusField), the
// way the release button disappears once there is no next release step. The
// write itself is the page's, passed in as `onClick`.
import { Button } from "../ui/primitives";
import { isCompleted } from "../../lib/mediaTabs";

export default function MarkCompletedButton({ type, entry, onClick }) {
  if (isCompleted(type, entry)) return null;
  return <Button onClick={onClick}>Mark completed</Button>;
}
