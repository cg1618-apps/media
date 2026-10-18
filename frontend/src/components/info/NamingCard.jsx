// Frontend: info component file for NamingCard.
//
// Only the names the item actually has are listed - a blank one gets no row -
// and with none set the card is left out entirely.
import InfoCard from "./InfoCard";
import { getNamingFields } from "../../utils/media";

const hasValue = ({ value }) => value != null && String(value).trim() !== "";

export default function NamingCard({ type, item }) {
  const fields = getNamingFields(item, type).filter(hasValue);
  if (fields.length === 0) return null;
  return <InfoCard title="Naming" fields={fields} />;
}
