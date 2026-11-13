// Frontend: the words the request pages print for a request's codes.
//
// The codes themselves come from /api/constants (`request_kind`,
// `request_status`); this file only names them. A code with no label here is
// printed as it is, so a kind added on the server still renders.

export const REQUEST_KIND_LABELS = {
  new_entry: "New entry request",
  data_error: "Data error report",
  incomplete_data: "Incomplete data report",
  bug: "Bug report",
  other: "Other / suggestion",
};

export const REQUEST_STATUS_LABELS = {
  open: "Open",
  done: "Done",
  declined: "Declined",
};

export function requestKindLabel(kind) {
  return REQUEST_KIND_LABELS[kind] ?? kind;
}

export function requestStatusLabel(status) {
  return REQUEST_STATUS_LABELS[status] ?? status;
}

// Shown where an account reference came back null: the account was deleted.
export const DELETED_ACCOUNT = "deleted account";

export function formatRequestDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
