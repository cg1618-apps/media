// Frontend: page component file for MyRequests - the filer's own requests.
//
// Every request this account has filed, newest first, with where each one
// stands. An open one can be edited (description and remark only, while
// `can_edit`); a done or declined one is read-only, and nothing here deletes.
// "New request" opens the general form; a request about one entry, group or
// entity is filed from that page's "Report a problem" instead.
//
// Gated on self.requests, as App.jsx's route and the header link are.
import { useState } from "react";

import { useMyRequests } from "../../api/mutations/useRequestMutations";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import RequestModal from "../../components/modals/RequestModal";
import RequestTarget from "../../components/requests/RequestTarget";
import { Button, Chip, Eyebrow } from "../../components/ui/primitives";
import {
  formatRequestDate,
  requestKindLabel,
  requestStatusLabel,
} from "../../lib/requests";

// Whether the filer reads the handler's response beside the status. The owner
// decided yes; the API returns it either way, so this one switch is all that
// changes it.
export const SHOW_RESPONSE_TO_FILER = true;

export default function MyRequests() {
  const { data, isLoading, error } = useMyRequests();
  // null: closed; "new": the general form; a request: editing it.
  const [modal, setModal] = useState(null);
  const requests = data ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="border-b border-border pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-text leading-none">
            My requests
          </h1>
          <p className="text-sm text-text-muted mt-1">
            What you have asked for or reported, and where each one stands
          </p>
        </div>
        <Button kind="primary" onClick={() => setModal("new")}>
          New request
        </Button>
      </header>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText="Loading requests..."
          errorTitle="Error loading requests."
        />
      ) : requests.length === 0 ? (
        <p className="text-sm text-text-muted">
          You have no requests. Use New request, or Report a problem on the page
          of the entry, group or entity it is about.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left">
                <th className="px-3 py-2"><Eyebrow>Kind</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>About</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Description</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Remark</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Status</Eyebrow></th>
                {SHOW_RESPONSE_TO_FILER && (
                  <th className="px-3 py-2"><Eyebrow>Response</Eyebrow></th>
                )}
                <th className="px-3 py-2"><Eyebrow>Filed</Eyebrow></th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b border-border last:border-b-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{requestKindLabel(request.kind)}</td>
                  <td className="px-3 py-2"><RequestTarget request={request} /></td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-text">{request.description}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-text-muted">{request.remark}</td>
                  <td className="px-3 py-2">
                    <Chip tone={request.status === "open" ? "ink" : "muted"}>
                      {requestStatusLabel(request.status)}
                    </Chip>
                  </td>
                  {SHOW_RESPONSE_TO_FILER && (
                    <td className="px-3 py-2 whitespace-pre-wrap text-text-muted">
                      {request.response}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-text-faint">
                    {formatRequestDate(request.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {request.can_edit && (
                      <Button size="sm" onClick={() => setModal(request)}>
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <RequestModal
          request={modal === "new" ? null : modal}
          defaultKind="new_entry"
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
