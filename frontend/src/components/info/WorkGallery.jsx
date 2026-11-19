// Frontend: an author's or illustrator's gallery of works, on their person
// page.
//
// Read from GET /api/person/{id}/work-images, which answers the pictures in
// display order - empty for a person who holds neither role, or whose only
// such role is scoped to a type this session cannot see. The section is drawn
// only once there is something in it: nothing while it loads, nothing for an
// empty gallery, and one muted line if the read fails, since the rest of the
// page is still worth reading. Pictures are added, captioned, reordered and
// removed where the photo is edited - the person form's Works field
// (components/forms/WorkImagesEditor.jsx).
//
// There is no lightbox in the app, so a tile opens the full picture in a new
// tab. Tiles are square crops of the library thumbnail; a gallery picture has
// no focal point of its own, so they say data-focus="none".
import { useEffect, useState } from "react";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { FALLBACK_SVG } from "../../lib/covers";
import { holdsGalleryRole, workImageUrls } from "../../lib/workImages";
import { Slip } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";

export default function WorkGallery({ person }) {
  const personId = person?.system_id;
  const offered = holdsGalleryRole(person?.roles);
  const [pictures, setPictures] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!personId || !offered) return undefined;
    let cancelled = false;
    fetchJson(endpoints.person.workImages(personId))
      .then((rows) => !cancelled && setPictures(rows || []))
      .catch((e) => !cancelled && setError(e.message || "Works could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [personId, offered]);

  if (!offered) return null;
  if (error) {
    return (
      <Slip title="Works">
        <p className="text-sm text-text-faint">Works could not be loaded.</p>
      </Slip>
    );
  }
  if (pictures.length === 0) return null;

  return (
    <Slip title="Works" actions={<span className="font-mono text-[11px] text-text-faint">{pictures.length}</span>}>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" aria-label="Works">
        {pictures.map((picture) => {
          const { full, thumb } = workImageUrls(picture);
          return (
            <li key={picture.system_id}>
              <figure className="flex flex-col gap-1.5">
                <a
                  href={full}
                  target="_blank"
                  rel="noreferrer"
                  className="block bg-surface-2 border border-border hover:border-border-strong transition-colors overflow-hidden aspect-square"
                  aria-label={picture.caption ? `Open ${picture.caption}` : "Open picture"}
                >
                  <LazyImage
                    src={thumb}
                    alt={picture.caption || ""}
                    className="w-full h-full object-cover"
                    data-focus="none"
                    onError={(e) => {
                      e.target.src = FALLBACK_SVG;
                    }}
                  />
                </a>
                {picture.caption && (
                  <figcaption className="text-sm text-text-muted leading-snug">
                    {picture.caption}
                  </figcaption>
                )}
              </figure>
            </li>
          );
        })}
      </ul>
    </Slip>
  );
}
