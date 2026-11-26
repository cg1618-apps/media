// A record's summary: enough to tell it from a similarly named one. The admin
// Delete page draws it for the record picked for deletion and again for a
// merge target, side by side, so the two can be compared before Confirm.
//
// What each type shows is lib/recordSummary.js; this file only draws it. An
// entity (person, character, identity, studio, publisher) also lists the
// entries it is credited on or cast in, read from its /entries endpoint.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../../api/client";
import { mediaTypeLabel, ownerTypeLabel } from "../../config/mediaRegistry";
import { FALLBACK_SVG, focusStyle, getCoverUrl, thumbUrl } from "../../lib/covers";
import { entityPath } from "../../lib/entityPath";
import { releaseYear } from "../../lib/releaseDate";
import {
  flattenEntryGroups,
  summaryFacts,
  summaryLinks,
  summaryNames,
  summaryOptionLine,
  summarySpec,
} from "../../lib/recordSummary";
import LazyImage from "../ui/LazyImage";
import { eyebrowCls } from "../ui/primitives";

// How many credited entries the card names before "+N more".
export const SUMMARY_ENTRY_LIMIT = 5;

function SummaryImage({ image, size = "w-16 h-24" }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-lg bg-surface-2`}>
      <LazyImage
        src={thumbUrl(getCoverUrl(image.file))}
        className="w-full h-full object-cover"
        style={focusStyle(image.focus)}
        onError={(e) => {
          e.target.src = FALLBACK_SVG;
        }}
        alt=""
      />
    </div>
  );
}

// The entries an entity is credited on: a count, then the newest few by
// name with their type and year, then how many more.
function SummaryEntries({ type, record }) {
  const spec = summarySpec(type);
  const id = record.system_id;
  const query = useQuery({
    queryKey: ["record-summary-entries", type, id],
    queryFn: () => fetchJson(spec.entries(id)),
    enabled: id != null,
  });

  if (query.isLoading) {
    return (
      <p className="text-xs text-text-faint flex items-center gap-2">
        <i className="fas fa-spinner fa-spin"></i>
        Loading entries…
      </p>
    );
  }
  if (query.isError) {
    return <p className="text-xs text-danger">Could not load its entries.</p>;
  }

  const entries = flattenEntryGroups(query.data?.groups);
  const shown = entries.slice(0, SUMMARY_ENTRY_LIMIT);
  const more = entries.length - shown.length;
  return (
    <div data-testid="record-summary-entries">
      <div className={eyebrowCls}>
        Entries · {entries.length}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-text-faint mt-1">Not credited on any entry.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {shown.map((entry) => {
            const path = entityPath(entry.media_type, entry);
            const typeLabel = mediaTypeLabel(entry.media_type);
            const detail = [
              typeLabel,
              releaseYear(entry.release_date) || null,
              ...entry.labels.filter((l) => l !== typeLabel),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={`${entry.media_type}:${entry.system_id}`}
                className="text-xs text-text flex gap-2 min-w-0"
              >
                {path ? (
                  <Link
                    to={path}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:text-brand hover:underline"
                  >
                    {entry.display_name}
                  </Link>
                ) : (
                  <span className="truncate">{entry.display_name}</span>
                )}
                <span className="shrink-0 font-mono text-[10px] text-text-faint">
                  {detail}
                </span>
              </li>
            );
          })}
          {more > 0 && (
            <li className="font-mono text-[10px] text-text-faint">+{more} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * `title` is the record's name as the page shows it. `heading` captions the
 * card ("To delete", "Survives"). `franchise` and `series` are the names of
 * an entry's or a series' parents, which the row holds only by id. Anything
 * passed as children is drawn under the facts.
 */
export default function RecordSummaryCard({
  type,
  record,
  title,
  heading,
  franchise,
  series,
  children,
}) {
  const spec = summarySpec(type);
  const names = summaryNames(type, record).filter((n) => n.value !== title);
  const facts = summaryFacts(type, record, { franchise, series });
  const links = summaryLinks(type, record);
  const count = spec.count?.(record);

  return (
    <section
      data-testid="record-summary"
      aria-label={heading ? `${heading}: ${title}` : title}
      className="min-w-0 border border-border rounded-xl p-3 space-y-3"
    >
      {heading && <div className={eyebrowCls}>{heading}</div>}
      <div className="flex items-start gap-3">
        {spec.image && <SummaryImage image={spec.image(record)} />}
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-text text-base break-words">{title}</h3>
          <p className="font-mono text-[11px] text-text-faint">
            {[ownerTypeLabel(type), record.public_id != null && `#${record.public_id}`, count]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {names.length > 0 && (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
              {names.map((n) => (
                <div key={n.label} className="contents">
                  <dt className={eyebrowCls}>{n.label}</dt>
                  <dd className="text-text-muted break-words">{n.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className={eyebrowCls}>{f.label}</dt>
              <dd className="text-text break-words">
                {Array.isArray(f.value)
                  ? f.value.map((line) => <div key={line}>{line}</div>)
                  : f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {links.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {links.map((l) => (
            <a
              key={l.site}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              {l.site}
            </a>
          ))}
        </p>
      )}

      {spec.entries && <SummaryEntries type={type} record={record} />}

      {children}

      <p className="font-mono text-[10px] text-text-faint break-all">{record.system_id}</p>
    </section>
  );
}

/**
 * A search-dropdown row for an entity: a small picture, the name, and one
 * line of other names, type and count (summaryOptionLine).
 */
export function RecordSummaryOption({ type, record, title }) {
  const spec = summarySpec(type);
  return (
    <div className="flex items-center gap-2 min-w-0">
      {spec.image && <SummaryImage image={spec.image(record)} size="w-8 h-12" />}
      <div className="min-w-0">
        <div className="font-bold text-text text-sm">{title}</div>
        <div className="text-[11px] text-text-faint">
          {summaryOptionLine(type, record, title)}
        </div>
      </div>
    </div>
  );
}
