// Frontend: the ways out to an external site beside an entity's name - where
// it is looked up. MalButton (MyAnimeList) is shared by the character page,
// the identity page (which shows its character's), the person page and the
// studio page; ImdbButton by the person page, beside its MAL one, and
// SiteButton itself for the person's own pages (Twitter, Instagram, pixiv).
// Each renders nothing without a link, and all look the same. A site with no
// bundled icon (lib/sourceIcons.js) shows its name alone.
import { sourceIconUrl } from "../../lib/sourceIcons";
import LazyImage from "../ui/LazyImage";

export function SiteButton({ href, site }) {
  if (!href) return null;
  const icon = sourceIconUrl(site);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open on ${site}`}
      className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 font-mono text-[11px] text-text-muted hover:border-brand hover:text-brand"
    >
      {icon && <LazyImage src={icon} alt="" className="w-3.5 h-3.5" />}
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
