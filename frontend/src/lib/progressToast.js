// Frontend: the toast a progress write earns.
//
// A PATCH that carries an entry's progress counter up to its total finishes
// the entry on the server, as though Mark completed had been pressed (see
// docs/business-rules.md, "Reaching the total completes"). The saved row
// comes back Completed, and the toast says so rather than "Episodes updated!",
// because on a dashboard filtered to what is in progress the card is about to
// disappear and the reader deserves to know why.

const COMPLETED = "Completed";

function statusOf(row) {
  return row?.watching_status ?? row?.reading_status ?? null;
}

export const COMPLETED_TOAST = "Marked as Completed!";

// `before` is the row as it stood before the write, `after` the one the
// server returned. Only a change INTO Completed counts: stepping an entry that
// was already finished is an ordinary progress save.
export function progressToast(before, after, savedMessage) {
  const justCompleted =
    statusOf(after) === COMPLETED && statusOf(before) !== COMPLETED;
  return justCompleted ? COMPLETED_TOAST : savedMessage;
}
