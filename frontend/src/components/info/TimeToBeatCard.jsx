// Frontend: info component file for TimeToBeatCard.
//
// The game and h-game pages' IGDB time-to-beat estimates, one row of up to
// three figures. Only the recorded ones are shown, and with none recorded the
// card is left out.
import InfoCard from "./InfoCard";
import { timeToBeatFields } from "../../lib/gameHours";

export default function TimeToBeatCard({ entry }) {
  const fields = timeToBeatFields(entry);
  if (fields.length === 0) return null;
  return <InfoCard title="Time to Beat" fields={[fields]} />;
}
