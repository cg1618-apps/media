// Frontend: the editor for an author's or illustrator's gallery of works, in
// the person form beside the Photo picker.
//
// Every action saves at once, as the Photo picker's does, rather than with
// the form: upload (several files at a time) appends through POST, a caption
// PATCHes on blur, a drag or arrow key PUTs the whole order, and Remove
// DELETEs the picture - which deletes its file too unless another owner uses
// the same image. The server answers each with the gallery (or the one
// picture), and that answer becomes the list. A move shows the new order at
// once and freezes the grips until the PUT settles; a failed one puts the old
// order back.
//
// It needs a saved person to attach to, so the form offers it on Modify only,
// and only while the form's roles hold author or illustrator. The server
// checks the SAVED roles: a role ticked but not yet saved gets the API's 422,
// shown here.
import { useEffect, useRef, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { FALLBACK_SVG } from "../../lib/covers";
import { workImageUrls } from "../../lib/workImages";
import { Button } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";
import { DragHandle, SortableItem, SortableList, arrayMove } from "../ui/Sortable";
import { inputCls } from "./FormField";

// Keyed on the saved caption by its caller, so a new answer from the server
// starts it afresh.
function CaptionInput({ picture, onSave }) {
  const [value, setValue] = useState(picture.caption ?? "");
  return (
    <input
      className={inputCls}
      value={value}
      placeholder="Caption"
      aria-label={`Caption for picture ${picture.position + 1}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() !== (picture.caption ?? "")) onSave(value);
      }}
    />
  );
}

export default function WorkImagesEditor({ personId }) {
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!personId) return undefined;
    let cancelled = false;
    fetchJson(endpoints.person.workImages(personId))
      .then((rows) => !cancelled && setPictures(rows || []))
      .catch((e) => !cancelled && setError(e.message || "The works could not be loaded."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [personId]);

  // Runs one write; its error is shown under the list.
  async function run(write) {
    setBusy(true);
    setError(null);
    try {
      await write();
      return true;
    } catch (e) {
      setError(e.message || "Saving the works failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function upload(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const body = new FormData();
    // No Content-Type header: the browser sets it, with the boundary.
    files.forEach((file) => body.append("files", file));
    run(async () => {
      setPictures(
        await fetchJson(endpoints.person.workImages(personId), { method: "POST", body }),
      );
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(from, to) {
    const before = pictures;
    const next = arrayMove(pictures, from, to);
    setPictures(next);
    run(async () => {
      setPictures(
        await fetchJson(endpoints.person.workImages(personId), {
          method: "PUT",
          ...jsonBody({ attachment_ids: next.map((p) => p.system_id) }),
        }),
      );
    }).then((ok) => !ok && setPictures(before));
  }

  function saveCaption(picture, caption) {
    run(async () => {
      const saved = await fetchJson(endpoints.person.workImage(personId, picture.system_id), {
        method: "PATCH",
        ...jsonBody({ caption }),
      });
      setPictures((rows) => rows.map((p) => (p.system_id === saved.system_id ? saved : p)));
    });
  }

  function remove(picture) {
    run(async () => {
      await fetchJson(endpoints.person.workImage(personId, picture.system_id), {
        method: "DELETE",
      });
      setPictures((rows) =>
        rows
          .filter((p) => p.system_id !== picture.system_id)
          .map((p, index) => ({ ...p, position: index })),
      );
    });
  }

  const ids = pictures.map((p) => p.system_id);

  return (
    <div className="space-y-2">
      {loading ? (
        <p className="text-sm text-text-faint">Loading works…</p>
      ) : pictures.length === 0 ? (
        <p className="text-sm text-text-faint">No works yet. Upload pictures of their work to show them on their page.</p>
      ) : (
        <ul className="space-y-2" aria-label="Works being edited">
          <SortableList ids={ids} onMove={move} disabled={busy}>
            {pictures.map((picture) => (
              <SortableItem
                as="li"
                key={picture.system_id}
                id={picture.system_id}
                className="flex items-center gap-2"
              >
                <DragHandle label={picture.caption || `picture ${picture.position + 1}`} />
                <div className="w-14 h-14 shrink-0 bg-surface-2 border border-border overflow-hidden">
                  <LazyImage
                    src={workImageUrls(picture).thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    data-focus="none"
                    onError={(e) => {
                      e.target.src = FALLBACK_SVG;
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <CaptionInput
                    key={picture.caption ?? ""}
                    picture={picture} onSave={(c) => saveCaption(picture, c)} />
                </div>
                <button
                  type="button"
                  onClick={() => remove(picture)}
                  disabled={busy}
                  aria-label={`Remove ${picture.caption || `picture ${picture.position + 1}`}`}
                  className="text-text-faint hover:text-danger px-1 disabled:opacity-30"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </SortableItem>
            ))}
          </SortableList>
        </ul>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy || loading}>
          {busy ? "Saving…" : "Upload pictures"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          data-testid="work-images-input"
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      {error && <p className="text-[11px] font-bold text-danger">{error}</p>}
    </div>
  );
}
