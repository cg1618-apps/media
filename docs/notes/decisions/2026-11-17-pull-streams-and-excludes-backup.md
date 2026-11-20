# Pull streams its progress, and never runs beside a Backup

- **Pull streams the way Backup does, on the same plumbing**: a worker thread
  with its own session, a `processing` event per tab, the pipeline's own result
  dict as the last event, and a keepalive every 15 seconds, so a Pull All
  outlasts the tunnel's ~100-second idle window. The lock and worker live in
  `app/services/pipelines/worker.py`, the relay in `data_control.py`.
- **Pull and Backup exclude each other.** A Pull reading a sheet a Backup is
  rewriting tab by tab restores half old and half new data, and a Backup during
  a Pull writes the half-restored database over the very sheet being read.
  Rejected: a Pull that excludes only other Pulls. Rejected: one shared lock,
  because the refusal would say "a backup is running" when it is a Pull. Each
  run takes its own lock and reads the other's from `pg_locks` without taking
  it; two that start together both refuse, which is safe.
- **The final result stays the pipeline's own dict**, so the page keeps what the
  JSON response carried; a Pull All failure arrives as an `error` event with
  its message.
