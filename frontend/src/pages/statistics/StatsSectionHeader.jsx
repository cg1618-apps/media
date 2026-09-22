// Frontend: statistics page file for StatsSectionHeader.
//
// Every block on the statistics page is headed the same way, because they
// are peers: an eyebrow, then the section's name at one size. The page's own
// <h1> is the only heading above it.
//
// This exists because the four blocks had drifted - two rendered an <h1> of
// their own (so the page had three), one was a size smaller than the rest,
// and the gap below the header was 4 in one place and 6 in the others.
import { Eyebrow } from "../../components/ui/primitives";

export default function StatsSectionHeader({ eyebrow, title }) {
  return (
    <header className="mb-6">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none mt-1">
        {title}
      </h2>
    </header>
  );
}
