// Frontend: admin page for configuring Add/Modify form defaults.
//
// Three things per media type: the initial value of each form field, which
// fields the "auto-fill from existing entry" search copies, and which of the
// type's restricted source names a new entry is prefilled with (per region on
// h-comic - lib/restrictedSources.js).
//
// Stored defaults are SPARSE — only fields the admin actually overrode are
// saved, so the built-in factory values stay the baseline and a field reverts
// simply by being removed. Configured defaults apply to NEW entries and as
// fallbacks for NULL values; they never rewrite existing rows.
//
// The saved config is the form-defaults query (hooks/useFormDefaults.js),
// the one Add and Modify read; saving and resetting write it, so neither of
// them can open on stale defaults.

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../hooks/useToast";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../hooks/queryUtils";
import {
  NO_FORM_DEFAULTS,
  formDefaultsQueryKey,
  useFormDefaults,
} from "../../hooks/useFormDefaults";
import { FORM_TABS } from "../../config/adminTabs";
import AdminTabBar from "../../components/layout/AdminTabBar";
import { BUILTIN_AUTOFILL, getFieldRegistry } from "../../config/formFields";
import DefaultsTab from "../defaults-tabs/DefaultsTab";
import { fetchAllSources } from "../../lib/sources";

const emptyDraft = (type) => ({
  defaults: {},
  autofill: [...(BUILTIN_AUTOFILL[type] ?? [])],
  restricted_prefill: null,
});

/** Builds the editable draft for one type from what the server returned. */
function toDraft(type, stored) {
  return {
    defaults: { ...(stored?.defaults ?? {}) },
    // null means "not configured" — fall back to the built-in field set.
    // An empty array is a real choice and must be preserved.
    autofill: [...(stored?.autofill ?? BUILTIN_AUTOFILL[type] ?? [])],
    // null means "not configured" — every variant prefills its built-ins. A
    // variant absent from the map is built-in too; [] prefills nothing.
    restricted_prefill: stored?.restricted_prefill
      ? JSON.parse(JSON.stringify(stored.restricted_prefill))
      : null,
  };
}

/** Builds a full draft map — one entry per tab — from a server config. */
function seedDrafts(config) {
  return Object.fromEntries(
    FORM_TABS.map((tab) => [tab.key, toDraft(tab.key, config?.[tab.key])]),
  );
}

function sameDraft(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const EMPTY_SOURCES = { options: [], studios: [], publishers: {}, people: {} };

export default function FormDefaults() {
  const { showToast } = useToast();
  // The saved config and the suggestion lists load side by side.
  const { data: config, isPending, isError } = useFormDefaults();
  const [sources, setSources] = useState(null);

  useEffect(() => {
    fetchAllSources()
      .then(setSources)
      .catch(() => {
        setSources(EMPTY_SOURCES);
        showToast("error", "Failed to load the suggestion lists.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A config that cannot be read is no config: the page shows the built-ins.
  useEffect(() => {
    if (isError) showToast("error", "Could not load saved defaults — showing built-ins.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  if (isPending || !sources) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-text-faint font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Mounted once the config is in, so the drafts start from it.
  return <FormDefaultsEditor config={config ?? NO_FORM_DEFAULTS} sources={sources} />;
}

function FormDefaultsEditor({ config, sources }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("anime");
  const [saving, setSaving] = useState(false);

  // `saved` mirrors the server through the query cache; `drafts` holds
  // unsaved edits for every tab, so switching tabs never discards work.
  const saved = useMemo(() => seedDrafts(config), [config]);
  const [drafts, setDrafts] = useState(() => seedDrafts(config));

  const dirtyTabs = useMemo(
    () =>
      FORM_TABS.filter(
        (t) => drafts[t.key] && !sameDraft(drafts[t.key], saved[t.key]),
      ).map((t) => t.key),
    [drafts, saved],
  );

  // Warn before losing unsaved edits on reload / navigating away.
  useEffect(() => {
    if (dirtyTabs.length === 0) return;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyTabs.length]);

  // Never undefined: an unseeded tab still renders its built-ins.
  const draft = drafts[activeTab] ?? emptyDraft(activeTab);
  const isDirty = dirtyTabs.includes(activeTab);

  function patchDraft(fn) {
    setDrafts((prev) => ({ ...prev, [activeTab]: fn(prev[activeTab]) }));
  }

  function setFieldDefault(key, value) {
    patchDraft((d) => ({ ...d, defaults: { ...d.defaults, [key]: value } }));
  }

  function clearFieldDefault(key) {
    patchDraft((d) => {
      const next = { ...d.defaults };
      delete next[key];
      return { ...d, defaults: next };
    });
  }

  function setPrefill(variant, names) {
    patchDraft((d) => ({
      ...d,
      restricted_prefill: { ...(d.restricted_prefill ?? {}), [variant]: names },
    }));
  }

  function clearPrefill(variant) {
    patchDraft((d) => {
      const next = { ...(d.restricted_prefill ?? {}) };
      delete next[variant];
      return {
        ...d,
        restricted_prefill: Object.keys(next).length ? next : null,
      };
    });
  }

  function toggleAutofill(key) {
    patchDraft((d) => ({
      ...d,
      autofill: d.autofill.includes(key)
        ? d.autofill.filter((k) => k !== key)
        : [...d.autofill, key],
    }));
  }

  function setGroupAutofill(keys, on) {
    patchDraft((d) => ({
      ...d,
      autofill: on
        ? [...new Set([...d.autofill, ...keys])]
        : d.autofill.filter((k) => !keys.includes(k)),
    }));
  }

  // Writes one type's stored config into the shared cache - or, with null,
  // drops it - so Add and Modify open on it at once. A config that never
  // loaded is not known for the other types, so it is read again instead.
  function storeLocally(type, stored) {
    const key = formDefaultsQueryKey();
    if (queryClient.getQueryData(key) === undefined) {
      queryClient.invalidateQueries({ queryKey: key });
      return;
    }
    queryClient.setQueryData(key, (prev) => {
      const next = { ...prev };
      if (stored) next[type] = stored;
      else delete next[type];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        version: 1,
        defaults: draft.defaults,
        autofill: draft.autofill,
        restricted_prefill: draft.restricted_prefill,
      };
      await fetchJson(endpoints.formDefaults.update(activeTab), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      storeLocally(activeTab, {
        media_type: activeTab,
        ...JSON.parse(JSON.stringify(body)),
      });
      showToast("success", "Form defaults saved.");
    } catch (err) {
      showToast("error", err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        `Reset every field on the ${activeTab} tab to its built-in default? This also restores the built-in auto-fill selection.`,
      )
    )
      return;

    setSaving(true);
    try {
      await fetchJson(endpoints.formDefaults.reset(activeTab), { method: "DELETE" });
      const fresh = emptyDraft(activeTab);
      storeLocally(activeTab, null);
      setDrafts((prev) => ({
        ...prev,
        [activeTab]: JSON.parse(JSON.stringify(fresh)),
      }));
      showToast("success", "Reset to built-in defaults.");
    } catch (err) {
      showToast("error", err.message || "Reset failed.");
    } finally {
      setSaving(false);
    }
  }

  const overrideCount =
    Object.keys(draft.defaults).length +
    Object.keys(draft.restricted_prefill ?? {}).length;
  const autofillCount = draft.autofill.filter((k) =>
    getFieldRegistry(activeTab).some((f) => f.key === k),
  ).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text flex items-center gap-3">
          <i className="fas fa-sliders-h text-brand"></i> Form Defaults
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Set the starting value of each Add-form field and choose which fields
          auto-fill copies. Applies to new entries only — existing entries are
          never changed.
        </p>
      </div>

      {/* Tabs */}
      <AdminTabBar
        tabs={FORM_TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
        renderBadge={(t) =>
          dirtyTabs.includes(t.key) ? (
            <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
          ) : null
        }
      />

      <DefaultsTab
        type={activeTab}
        draft={draft}
        setFieldDefault={setFieldDefault}
        clearFieldDefault={clearFieldDefault}
        toggleAutofill={toggleAutofill}
        setGroupAutofill={setGroupAutofill}
        setPrefill={setPrefill}
        clearPrefill={clearPrefill}
        sources={sources}
      />

      {/* Footer actions */}
      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-3 bg-surface/95 backdrop-blur border border-border rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs font-bold text-text-faint">
          {overrideCount} field{overrideCount === 1 ? "" : "s"} overridden ·{" "}
          {autofillCount} auto-filled
        </span>
        {isDirty && (
          <span className="text-xs font-bold text-warning">
            <i className="fas fa-circle text-[6px] mr-1 align-middle"></i>
            Unsaved changes
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="px-3 py-2 border border-border rounded-lg text-xs font-bold text-text-muted hover:bg-surface-2 transition disabled:opacity-50"
          >
            <i className="fas fa-undo text-xs mr-1.5"></i>
            Reset tab to built-in
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-5 py-2 bg-brand text-on-brand rounded-lg text-xs font-black hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <>
                <i className="fas fa-save text-xs mr-1.5"></i>Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
