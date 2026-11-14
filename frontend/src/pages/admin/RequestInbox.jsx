// Frontend: page component file for RequestInbox - every account's requests.
//
// The handler's side of requests and reports (manage.requests: super, and
// the admin through root). Opens on the open requests; the filter shows the
// done and declined ones, which stay stored until someone deletes them.
//
// Per row: an open request is marked Done or Declined, each with an optional
// response the filer reads back on My requests; a closed one can be reopened,
// which lets its author edit it again. Delete is a hard delete, confirmed
// first - the server keeps no other record of it.
import { useState } from "react";

import {
  useDeleteRequest,
  useRequestInbox,
  useSetRequestStatus,
} from "../../api/mutations/useRequestMutations";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ConfirmModal from "../../components/modals/ConfirmModal";
import RequestTarget from "../../components/requests/RequestTarget";
import { inputCls } from "../../components/forms/FormField";
import { Button, Chip, Eyebrow } from "../../components/ui/primitives";
import { useToast } from "../../hooks/useToast";
import {
  DELETED_ACCOUNT,
  formatRequestDate,
  requestKindLabel,
  requestStatusLabel,
} from "../../lib/requests";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

// What closing a request is called, by the status it closes to.
const CLOSE_ACTIONS = {
  done: { title: "Mark done", confirm: "Mark done" },
  declined: { title: "Decline", confirm: "Decline" },
};

export default function RequestInbox() {
  const { showToast } = useToast();
  const [status, setStatus] = useState("open");
  const { data, isLoading, error } = useRequestInbox(status);
  const setRequestStatus = useSetRequestStatus();
  const deleteRequest = useDeleteRequest();
  // { request, status } while the close dialog is open.
  const [closing, setClosing] = useState(null);
  const [response, setResponse] = useState("");
  const [deleting, setDeleting] = useState(null);
  const requests = data ?? [];

  function startClosing(request, next) {
    setResponse(request.response ?? "");
    setClosing({ request, status: next });
  }

  async function changeStatus(request, next, text) {
    try {
      await setRequestStatus.mutateAsync({
        id: request.id,
        status: next,
        ...(text === undefined ? {} : { response: text.trim() || null }),
      });
      showToast("success", next === "open" ? "Reopened" : `Marked ${requestStatusLabel(next).toLowerCase()}`);
      return true;
    } catch (err) {
      showToast("error", err.message || "Update failed");
      return false;
    }
  }

  async function confirmClose() {
    const ok = await changeStatus(closing.request, closing.status, response);
    if (ok) setClosing(null);
  }

  async function confirmDelete() {
    try {
      await deleteRequest.mutateAsync(deleting.id);
      showToast("success", "Request deleted");
      setDeleting(null);
    } catch (err) {
      showToast("error", err.message || "Delete failed");
    }
  }

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-4xl font-semibold text-text leading-none">
          Request inbox
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Requests and reports from every account, newest first
        </p>
      </header>

      <div role="group" aria-label="Status filter" className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            aria-pressed={status === f.key}
          >
            <Chip tone={status === f.key ? "brand" : "ink"}>{f.label}</Chip>
          </button>
        ))}
      </div>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText="Loading requests..."
          errorTitle="Error loading requests."
        />
      ) : requests.length === 0 ? (
        <p className="text-sm text-text-muted">
          {status === "all"
            ? "No requests have been filed."
            : `No ${requestStatusLabel(status).toLowerCase()} requests.`}
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left">
                <th className="px-3 py-2"><Eyebrow>Kind</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>From</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>About</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Description</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Remark</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Status</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Response</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Handled</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Filed</Eyebrow></th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  data-testid="request-row"
                  className="border-b border-border last:border-b-0 align-top"
                >
                  <td className="px-3 py-2 whitespace-nowrap">{requestKindLabel(request.kind)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {request.author_username ?? (
                      <span className="text-text-faint">{DELETED_ACCOUNT}</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><RequestTarget request={request} /></td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-text">{request.description}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-text-muted">{request.remark}</td>
                  <td className="px-3 py-2">
                    <Chip tone={request.status === "open" ? "ink" : "muted"}>
                      {requestStatusLabel(request.status)}
                    </Chip>
                  </td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-text-muted">{request.response}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-text-muted">
                    {request.handled_at && (
                      <>
                        <span className="block">
                          {request.handled_by_username ?? DELETED_ACCOUNT}
                        </span>
                        <span className="font-mono text-text-faint">
                          {formatRequestDate(request.handled_at)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-text-faint">
                    {formatRequestDate(request.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      {request.status === "open" ? (
                        <>
                          <Button size="sm" onClick={() => startClosing(request, "done")}>
                            Done
                          </Button>
                          <Button size="sm" onClick={() => startClosing(request, "declined")}>
                            Decline
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={setRequestStatus.isPending}
                          onClick={() => changeStatus(request, "open")}
                        >
                          Reopen
                        </Button>
                      )}
                      <Button size="sm" kind="danger" onClick={() => setDeleting(request)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {closing && (
        <ConfirmModal
          title={CLOSE_ACTIONS[closing.status].title}
          confirmLabel={CLOSE_ACTIONS[closing.status].confirm}
          busy={setRequestStatus.isPending}
          onConfirm={confirmClose}
          onCancel={() => setClosing(null)}
        >
          <label
            htmlFor="request-response"
            className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1"
          >
            Response (optional)
          </label>
          <textarea
            id="request-response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            className={`${inputCls} resize-y`}
          />
          <p className="text-xs text-text-faint mt-2">
            {closing.request.author_username ?? "The author"} reads this on their
            own list.
          </p>
        </ConfirmModal>
      )}

      {deleting && (
        <ConfirmModal
          title="Delete request"
          confirmLabel="Delete"
          danger
          busy={deleteRequest.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          Delete this {requestKindLabel(deleting.kind).toLowerCase()} from{" "}
          {deleting.author_username ?? DELETED_ACCOUNT}? It is removed for good,
          from the inbox and from its author&apos;s list.
        </ConfirmModal>
      )}
    </div>
  );
}
