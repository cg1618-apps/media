// Frontend: adding, editing and deleting dashboard announcements, for a
// viewer holding manage.announcements (the caller checks it). The writes
// are the announcement routes /system's Announcement & Notes card uses:
// POST to add, PUT with `original_title` to edit, DELETE by title. Each
// refetches the ["announcements"] query, which the board above it reads.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { Button, Slip } from "../ui/primitives";

export const ANNOUNCEMENTS_QUERY_KEY = ["announcements"];

const INPUT_CLS =
  "w-full bg-surface border border-border-strong px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";

function useAnnouncementMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY }),
  });
}

export default function AnnouncementEditor({ announcements = [] }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(null); // original title, or null when adding
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const save = useAnnouncementMutation(({ original, data }) =>
    original === null
      ? fetchJson(endpoints.announcements.create(), { method: "POST", ...jsonBody(data) })
      : fetchJson(endpoints.announcements.update(), {
          method: "PUT",
          ...jsonBody({ original_title: original, ...data }),
        }),
  );
  const remove = useAnnouncementMutation((t) =>
    fetchJson(endpoints.announcements.remove(t), { method: "DELETE" }),
  );

  function reset() {
    setEditing(null);
    setTitle("");
    setBody("");
  }

  function startEdit(item) {
    setEditing(item.title);
    setTitle(item.title);
    setBody(item.body);
    setConfirmDelete(null);
  }

  function handleSave() {
    if (!title.trim() || !body.trim()) {
      showToast("warning", "Fill in both the title and the note.");
      return;
    }
    const wasEditing = editing !== null;
    save.mutate(
      { original: editing, data: { title: title.trim(), body: body.trim() } },
      {
        onSuccess: () => {
          reset();
          showToast("success", wasEditing ? "Announcement saved" : "Announcement added");
        },
        onError: (e) => showToast("error", e.message),
      },
    );
  }

  function handleDelete(t) {
    // Two-step inline confirmation: the first click arms, the second deletes.
    if (confirmDelete !== t) {
      setConfirmDelete(t);
      return;
    }
    setConfirmDelete(null);
    remove.mutate(t, {
      onSuccess: () => {
        if (editing === t) reset();
        showToast("success", `Announcement '${t}' deleted`);
      },
      onError: (e) => showToast("error", e.message),
    });
  }

  return (
    <Slip title="Edit announcements" data-testid="announcement-editor">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ul className="space-y-2">
          {announcements.length === 0 && (
            <li className="text-sm text-text-faint">Nothing posted yet.</li>
          )}
          {announcements.map((item) => (
            <li
              key={item.title}
              className={`border px-3 py-2 flex items-center gap-2 ${
                editing === item.title ? "border-brand bg-brand-soft" : "border-border"
              }`}
            >
              <span className="flex-1 min-w-0 truncate text-sm text-text">{item.title}</span>
              <Button size="sm" kind="ghost" onClick={() => startEdit(item)}>
                Edit
              </Button>
              <Button
                size="sm"
                kind="danger"
                onClick={() => handleDelete(item.title)}
                onBlur={() => setConfirmDelete(null)}
              >
                {confirmDelete === item.title ? "Confirm delete" : "Delete"}
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              maxLength={120}
              className={INPUT_CLS}
            />
          </label>
          <label className="block">
            <span className="sr-only">Note</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Write the announcement or note. Line breaks are kept."
              className={INPUT_CLS}
            />
          </label>
          <div className="flex gap-2">
            <Button kind="primary" onClick={handleSave} disabled={save.isPending}>
              {editing !== null ? "Save changes" : "Add announcement"}
            </Button>
            {editing !== null && (
              <Button onClick={reset}>Cancel</Button>
            )}
          </div>
        </div>
      </div>
    </Slip>
  );
}
