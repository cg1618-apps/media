// Frontend: the ways out to an external site beside an entity's name - where
// it is looked up. MalButton (MyAnimeList) is shared by the character page,
// the identity page (which shows its character's), the person page and the
// studio page; ImdbButton by the person page, beside its MAL one. Both render
// nothing without a link, and look the same: SiteButton draws them.
import { sourceIconUrl } from "../../lib/sourceIcons";
import LazyImage from "../ui/LazyImage";

function SiteButton({ href, site }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open on ${site}`}
      className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:border-brand hover:text-brand"
    >
      <LazyImage src={sourceIconUrl(site)} alt="" className="w-3.5 h-3.5" />
      {site}
    </a>
  );
}

export default function MalButton({ href }) {
  return <SiteButton href={href} site="MyAnimeList" />;
}

export function ImdbButton({ href }) {
  return <SiteButton href={href} site="IMDb" />;
}
