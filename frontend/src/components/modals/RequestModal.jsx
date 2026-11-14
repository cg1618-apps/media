// Frontend: modal component file for RequestModal.
//
// Files a request or edits one, in the app's own modal chrome (the shape of
// ConfirmModal). Three ways in:
//
// - **From a page** ("Report a problem"): `target` and `pagePath` are filled
//   in by the page. The target is shown read-only and the page address is
//   sent without being shown.
// - **The general form** (My requests → New request): no target. A bug
//   report offers a page-address field, since a bug is about a page rather
//   than a catalogue row.
// - **Editing** (`request` passed): only the description and the remark
//   change - the server refuses any other key - so the kind and the target
//   are read-only.
//
// A refusal (409 over the open-request limit, 409 once handled, 422) is shown
// inline in the server's own words and keeps the modal open with the draft.
import { useEffect, useId, useState } from "react";

import {
  useEditRequest,
  useFileRequest,
} from "../../api/mutations/useRequestMutations";
import { useConstants } from "../../config/useConstants";
import { useToast } from "../../hooks/useToast";
import { requestKindLabel } from "../../lib/requests";
import { inputCls, selectCls } from "../forms/FormField";
import { Button } from "../ui/primitives";

const LABEL_CLS =
  "block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1";

export default function RequestModal({
  request = null,
  target = null,
  pagePath = null,
  defaultKind = "data_error",
  onClose,
}) {
  const editing = Boolean(request);
  const constants = useConstants();
  const kinds = constants.request_kind ?? [];
  const { showToast } = useToast();
  const fileRequest = useFileRequest();
  const editRequest = useEditRequest();
  const busy = fileRequest.isPending || editRequest.isPending;
  const id = useId();

  const [kind, setKind] = useState(request?.kind ?? defaultKind);
  const [description, setDescription] = useState(request?.description ?? "");
  const [remark, setRemark] = useState(request?.remark ?? "");
  const [pageAddress, setPageAddress] = useState("");
  const [error, setError] = useState(null);

  // The target this request is about: the page's while filing, the stored
  // one while editing.
  const shownTarget = editing ? request.target : target;
  const offersPageAddress = !editing && !target && kind === "bug";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Describe the request first.");
      return;
    }
    setError(null);
    try {
      if (editing) {
        await editRequest.mutateAsync({
          id: request.id,
          data: { description: description.trim(), remark: remark.trim() || null },
        });
        showToast("success", "Request updated");
      } else {
        const body = { kind, description: description.trim() };
        if (remark.trim()) body.remark = remark.trim();
        if (target) {
          body.target_type = target.type;
          body.target_id = target.id;
        }
        const path = target ? pagePath : offersPageAddress ? pageAddress.trim() : null;
        if (path) body.page_path = path;
        await fileRequest.mutateAsync(body);
        showToast("success", "Request sent");
      }
      onClose();
    } catch (err) {
      setError(err.message || "The request could not be saved.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={submit}
        className="bg-surface border border-border shadow-xl max-w-lg w-full mx-4 overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3
            id={`${id}-title`}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            {editing ? "Edit request" : target ? "Report a problem" : "New request"}
          </h3>
        </div>

        <div className="px-6 py-5 space-y-4">
          {shownTarget && (
            <p className="text-sm text-text-muted">
              About{" "}
              <span className="font-semibold text-text">
                {shownTarget.type_label ? `${shownTarget.type_label}: ` : ""}
                {shownTarget.label}
              </span>
            </p>
          )}

          <div>
            {editing ? (
              <>
                <span className={LABEL_CLS}>Kind</span>
                <p className="text-sm text-text">{requestKindLabel(kind)}</p>
              </>
            ) : (
              <>
                <label htmlFor={`${id}-kind`} className={LABEL_CLS}>
                  Kind
                </label>
                <select
                  id={`${id}-kind`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className={selectCls}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {requestKindLabel(k)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {offersPageAddress && (
            <div>
              <label htmlFor={`${id}-page`} className={LABEL_CLS}>
                Page address
              </label>
              <input
                id={`${id}-page`}
                value={pageAddress}
                onChange={(e) => setPageAddress(e.target.value)}
                placeholder="/anime/123"
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label htmlFor={`${id}-description`} className={LABEL_CLS}>
              Description
              <span className="text-danger ml-0.5">*</span>
            </label>
            <textarea
              id={`${id}-description`}
              value={description}
              autoFocus
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className={`${inputCls} resize-y`}
            />
          </div>

          <div>
            <label htmlFor={`${id}-remark`} className={LABEL_CLS}>
              Remark
            </label>
            <textarea
              id={`${id}-remark`}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              className={`${inputCls} resize-y`}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" kind="primary" disabled={busy}>
            {editing ? "Save" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
