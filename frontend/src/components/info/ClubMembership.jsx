// Frontend: club membership on a person's page - the clubs an artist belongs
// to, and a club's members in order.
//
// A club is a person holding the `club` role, whose only scope is the gated
// h-comic type; membership is its own table (person_membership), read and
// replaced whole through GET/PUT /api/person/{id}/clubs and /members. So the
// whole block is drawn only for a session that can see h-comic
// (canSeeGatedType). The server omits hidden ends either way; this only keeps
// a narrower session from being shown an empty "Clubs" frame.
//
// Order matters on one side only. A club's member list is ordered - the PUT
// takes member_ids in display order - and a person's list of clubs is ordered
// by name, so only the members editor has arrows.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { entityPath } from "../../lib/entityPath";
import { canSeeGatedType } from "../../lib/gatedTypes";
import ComboBox from "../forms/ComboBox";
import { MoveButtons } from "../../pages/notes/sections/ui";
import { Button, Slip } from "../ui/primitives";

const linkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

function PersonLink({ person }) {
  const path = entityPath("person", person);
  return path ? (
    <Link to={path} className={linkCls}>
      {person.display_name}
    </Link>
  ) : (
    <span>{person.display_name}</span>
  );
}

// The people a picker offers, as ComboBox items, without those already
// chosen and without the person the page is about.
function pickerItems(people, chosen, selfId) {
  const taken = new Set([...chosen.map((p) => p.system_id), selfId]);
  return people
    .filter((p) => !taken.has(p.system_id))
    .map((p) => ({
      id: p.system_id,
      label: p.display_name || "Unknown",
      searchText: [p.display_name, p.name_en, p.name_cn, p.name_jp, p.name_alt]
        .filter(Boolean)
        .join(" "),
    }));
}

/**
 * One editable list of people. `ordered` adds the arrows; `candidatesUrl` is
 * fetched when editing starts, not before, since it may be every person.
 */
function MembershipList({
  title,
  people,
  isAdmin,
  ordered,
  candidatesUrl,
  selfId,
  emptyText,
  onSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(people);
    setEditing(true);
    fetchJson(candidatesUrl)
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setCandidates([]));
  };

  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.map((p) => p.system_id));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const actions =
    isAdmin && !editing ? (
      <Button size="sm" onClick={start}>
        Edit
      </Button>
    ) : null;

  return (
    <Slip title={title} actions={actions}>
      {!editing ? (
        people.length === 0 ? (
          <p className="text-sm text-text-faint">{emptyText}</p>
        ) : (
          <ol className="space-y-1.5" aria-label={title}>
            {people.map((p) => (
              <li key={p.system_id} className="text-sm">
                <PersonLink person={p} />
              </li>
            ))}
          </ol>
        )
      ) : (
        <div className="space-y-2">
          <ul className="space-y-1" aria-label={`${title} being edited`}>
            {draft.map((p, i) => (
              <li key={p.system_id} className="flex items-center gap-2 text-sm">
                {ordered && (
                  <MoveButtons
                    label={p.display_name}
                    atTop={i === 0}
                    atBottom={i === draft.length - 1}
                    onUp={() => move(i, -1)}
                    onDown={() => move(i, 1)}
                  />
                )}
                <span className="flex-1 min-w-0 truncate text-text">{p.display_name}</span>
                <button
                  type="button"
                  onClick={() => setDraft(draft.filter((x) => x.system_id !== p.system_id))}
                  aria-label={`Remove ${p.display_name}`}
                  className="text-text-faint hover:text-danger px-1"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </li>
            ))}
          </ul>
          <ComboBox
            items={pickerItems(candidates, draft, selfId)}
            selectedId={null}
            inputText=""
            onSelect={(id) => {
              const person = candidates.find((c) => c.system_id === id);
              if (person) setDraft([...draft, person]);
            }}
            onType={() => {}}
            onClear={() => {}}
            placeholder="Search to add…"
          />
          <div className="flex gap-2">
            <Button kind="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Slip>
  );
}

export default function ClubMembership({ person }) {
  const auth = useAuth();
  const { showToast } = useToast();
  const canSee = canSeeGatedType(auth, "h-comic");
  const isAdmin = Boolean(auth?.isAdmin);
  const [clubs, setClubs] = useState([]);
  const [members, setMembers] = useState([]);

  const roles = person?.roles || [];
  const isClub = roles.some((r) => r.role === "club");
  // An admin is offered the clubs editor on anyone credited for h-comic -
  // an artist or an author - rather than on every director and seiyuu.
  const worksOnHComic = roles.some((r) => r.scope === "h-comic" && r.role !== "club");
  const personId = person?.system_id;

  useEffect(() => {
    if (!canSee || !personId) return undefined;
    let cancelled = false;
    fetchJson(endpoints.person.clubs(personId))
      .then((rows) => !cancelled && setClubs(rows || []))
      .catch(() => {});
    if (isClub) {
      fetchJson(endpoints.person.members(personId))
        .then((rows) => !cancelled && setMembers(rows || []))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [canSee, personId, isClub]);

  const replace = useCallback(
    async (url, body, setRows, label) => {
      try {
        const rows = await fetchJson(url, { method: "PUT", ...jsonBody(body) });
        setRows(rows || []);
        showToast("success", `${label} saved`);
      } catch (e) {
        showToast("error", e.message || `${label} failed to save`);
        throw e;
      }
    },
    [showToast]
  );

  if (!canSee || !personId) return null;
  const showClubs = clubs.length > 0 || (isAdmin && worksOnHComic);
  if (!showClubs && !isClub) return null;

  return (
    <div className="space-y-6">
      {isClub && (
        <MembershipList
          title="Members"
          people={members}
          isAdmin={isAdmin}
          ordered
          candidatesUrl={endpoints.person.list()}
          selfId={personId}
          emptyText="No members recorded."
          onSave={(ids) =>
            replace(endpoints.person.members(personId), { member_ids: ids }, setMembers, "Members")
          }
        />
      )}
      {showClubs && (
        <MembershipList
          title="Clubs"
          people={clubs}
          isAdmin={isAdmin}
          ordered={false}
          candidatesUrl={endpoints.person.list("role=club&scope=h-comic")}
          selfId={personId}
          emptyText="Not a member of any club."
          onSave={(ids) =>
            replace(endpoints.person.clubs(personId), { club_ids: ids }, setClubs, "Clubs")
          }
        />
      )}
    </div>
  );
}
