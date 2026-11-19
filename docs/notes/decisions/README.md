# Decisions

One file per decision: `YYYY-MM-DD-<topic>.md`, dated by when the decision was
made. Each holds a `# Title`, then the reasoning that still binds and the
alternatives that were rejected — read the matching file before proposing a
change that "obviously" simplifies something.

- **The file names are the index.** Nothing here lists the files: a list would
  be one more file every pull request appends to.
- **A decision file holds the why, not the what.** Present-tense behaviour,
  rules and schema live on the matching page under `docs/` (`api.md`,
  `business-rules.md`, `data-model.md`, …).
- **Add a file in the pull request that makes the decision.** Two pull requests
  that each add a file cannot conflict.
- **Delete a file when it stops binding** — the code it is about is gone, or a
  later decision reversed it. A reversal gets a new file, and the file it
  overturns is deleted in the same commit.

The convention is the platform's (`CLAUDE.md`, "Decisions are one file each").
