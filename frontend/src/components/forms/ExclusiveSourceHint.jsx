// Frontend: the Exclusive Source field's own warning, shown while the form
// breaks the rule tying it to the sources (lib/exclusiveSource.js) - so the
// problem is on screen before Save, not only in the toast Save raises.
import { exclusiveSourceProblem } from "../../lib/exclusiveSource";

export default function ExclusiveSourceHint({ form }) {
  const problem = exclusiveSourceProblem(form);
  if (!problem) return null;
  return (
    <p role="alert" className="text-xs text-danger mb-2">
      {problem}
    </p>
  );
}
