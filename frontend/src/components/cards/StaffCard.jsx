// Frontend: the grid card a person or a studio is shown as.
//
// Lifted out of PersonLibrary/StudioLibrary when /search grew person and
// studio sections: three pages drawing the same card by hand is three places
// for it to drift. The types differ only in their image column, and the word in the alt text — everything else, including the
// credit count under the name, is the same card.
import { Link } from "react-router-dom";

import { getCoverUrl, FALLBACK_SVG, focusStyle, thumbUrl } from "../../lib/covers";
import { useEntityHref } from "../../lib/entityPath";
import { RatingStamp, eyebrowCls } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";

function StaffCard({
  to,
  label,
  name,
  imageFile,
  imageFocus,
  imageAlt,
  creditCount,
  rating,
}) {
  const coverUrl = getCoverUrl(imageFile);
  const credits = creditCount ?? 0;

  // `to` is empty when the entity carries no public_id, or the viewer lacks
  // that kind's view key (useEntityHref), so the card renders as plain markup
  // instead of a dead link.
  const Wrapper = to ? Link : "div";
  const wrapperProps = to ? { to } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`bg-surface border border-border hover:border-border-strong transition-colors flex flex-col group${
        to ? " cursor-pointer" : ""
      }`}
    >
      <div className="flex">
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          <RatingStamp
            rating={rating}
            size="sm"
            className="absolute top-1.5 right-1.5 z-10"
          />
          <LazyImage
            src={thumbUrl(coverUrl)}
            alt={imageAlt}
            className="w-full h-full object-cover"
            style={focusStyle(imageFocus)}
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        <span className={eyebrowCls}>
          {credits} credit{credits !== 1 ? "s" : ""}
        </span>
      </div>
    </Wrapper>
  );
}

export function PersonCard({ person }) {
  const entityHref = useEntityHref();
  return (
    <StaffCard
      to={entityHref("person", person)}
      label="Person"
      name={person.display_name || "Unknown Person"}
      // The server resolves the fallback (the chosen entry's cover, then the
      // newest visible one); a payload without it still has photo_file.
      imageFile={person.display_photo_file ?? person.photo_file}
      imageFocus={person.display_photo_focus ?? person.photo_focus}
      imageAlt="Photo"
      creditCount={person.credit_count}
      rating={person.my_rating}
    />
  );
}

export function StudioCard({ studio }) {
  const entityHref = useEntityHref();
  return (
    <StaffCard
      to={entityHref("studio", studio)}
      label="Studio"
      name={studio.display_name || "Unknown Studio"}
      // The server falls back to the newest visible credited entry's cover;
      // a payload without display_logo_* still has logo_file.
      imageFile={studio.display_logo_file ?? studio.logo_file}
      imageFocus={studio.display_logo_focus ?? studio.logo_focus}
      imageAlt="Logo"
      creditCount={studio.credit_count}
      rating={studio.my_rating}
    />
  );
}

export function PublisherCard({ publisher }) {
  const entityHref = useEntityHref();
  return (
    <StaffCard
      to={entityHref("publisher", publisher)}
      label="Publisher"
      name={publisher.display_name || "Unknown Publisher"}
      // The server falls back to the newest visible credited entry's cover;
      // a payload without display_logo_* still has logo_file.
      imageFile={publisher.display_logo_file ?? publisher.logo_file}
      imageFocus={publisher.display_logo_focus ?? publisher.logo_focus}
      imageAlt="Logo"
      creditCount={publisher.credit_count}
      rating={publisher.my_rating}
    />
  );
}

export default StaffCard;
