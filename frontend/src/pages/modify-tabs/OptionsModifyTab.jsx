// Frontend: modify tab page file for OptionsModifyTab.
import AliasPicker, {
  categoryHasAliases,
} from "../../components/forms/AliasPicker";
import { Field, SectionHeader, inputCls } from "../../components/forms/FormField";
import ScopePicker from "../../components/forms/ScopePicker";
import UsagePicker, {
  categoryHasUsages,
} from "../../components/forms/UsagePicker";
import { MEDIA_TYPES } from "../../config/fieldOptions";
import { isCommonOptionCategory } from "../../lib/optionCategoryGroups";

export default function OptionsModifyTab({
  editingItem,
  optValue,
  setOptValue,
  optScopes,
  setOptScopes,
  optUsages,
  setOptUsages,
  optAliases,
  setOptAliases,
}) {
  return (
    <>
      <SectionHeader icon="fa-cog" title="System Option" />
      <Field label="Category">
        <input
          className={inputCls + " bg-surface-2 text-text-faint"}
          value={editingItem.category}
          readOnly
        />
      </Field>
      <Field label="Option Value" required>
        <input
          className={inputCls}
          value={optValue}
          onChange={(e) => setOptValue(e.target.value)}
        />
      </Field>
      {/* The only place an existing value's scopes can be repaired by hand.
          Nothing derives them any more (Ruling R27). Not for a common
          option: its scope is its category's (COMMON_OPTION_SCOPES in
          app/utils/credit_roles.py), and the API leaves it untouched on
          update. */}
      {!isCommonOptionCategory(editingItem.category) && (
        <ScopePicker
          scopes={optScopes}
          setScopes={setOptScopes}
          mediaTypes={MEDIA_TYPES}
        />
      )}
      {/* Shown only on Platform (USAGE_CATEGORIES), the one category whose
          values feed both Main Sources and Official Source. */}
      {categoryHasUsages(editingItem.category) && (
        <UsagePicker usages={optUsages} setUsages={setOptUsages} />
      )}
      {/* Editing an option used to WIPE its aliases: saveOption sends the
          whole record and the PUT replaces the alias rows wholesale, so
          omitting them here deleted every one.

          Shown only where aliases are legal (ALIAS_CATEGORIES). The category
          is read-only on this form, so an option that cannot carry aliases
          never can — there is nothing to disable, only to omit. */}
      {categoryHasAliases(editingItem.category) && (
        <AliasPicker aliases={optAliases} setAliases={setOptAliases} />
      )}
    </>
  );
}

