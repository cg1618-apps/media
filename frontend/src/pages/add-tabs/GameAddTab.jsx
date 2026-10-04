// Frontend: add tab page file for GameAddTab.
//
// Two boxes at the top, as on every media tab: EntryAutofillSearch copies
// fields from a game already in the catalogue, and the IGDB search under it
// links the new entry to its IGDB record - the IGDB id it stores is Fill's
// only handle on the game. Everything else comes from the Fill pipeline, and
// the base game has its own picker below.
import ComboBox from "../../components/forms/ComboBox";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import GameCopiesEditor from "../../components/forms/GameCopiesEditor";
import MultiSelect from "../../components/forms/MultiSelect";
import SourcesEditor from "../../components/forms/SourcesEditor";
import ImagePicker from "../../components/forms/ImagePicker";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import {
  COMPLETION_LEVELS,
  GAME_COMPLETION_FLAGS,
  GAME_IS_MAIN,
  GAME_RELEASE_STATUSES,
  GAME_TYPES,
  MY_RATINGS,
  PLAYING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";

export { defaultGame } from "../../config/formFactories";

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `f` is the form state and `u` its updater, so the two pages
 * differ only in which state object they hand in.
 */
// `ownerId` is only passed by GameModifyTab, where the game row already
// exists - see ImagePicker's own module comment on why a brand-new (Add tab)
// row has nothing to attach to yet. When it is absent (the Add tab), the
// picked image cannot be attached until the game is saved, so its id is kept
// as `pending_image_id` for GameAddTab's caller to attach afterward.
export function GameFormBody({ f, u, allGames, excludeGameId, sources, ownerId }) {
  const { has } = useAuth();
  const canOwnCopies = has("self.list");
  // ck_games_not_self_parent: a game can never be its own base game, so the
  // row being edited is never offered as a parent.
  const baseGameChoices = excludeGameId
    ? allGames.filter((g) => g.system_id !== excludeGameId)
    : allGames;
  const tagField = (key, source, placeholder) => (
    <MultiSelect
      options={getSourceValues(sources, source)}
      value={f[key]}
      onChange={(v) => u(key, v)}
      placeholder={placeholder}
    />
  );

  const num = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        type="number"
        step="any"
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder="0"
      />
    </Field>
  );

  return (
    <>
      <Field label="Game Name CN">
        <input
          className={inputCls}
          value={f.game_name_cn}
          onChange={(e) => u("game_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Game Name EN">
          <input
            className={inputCls}
            value={f.game_name_en}
            onChange={(e) => u("game_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="Game Name Romaji">
          <input
            className={inputCls}
            value={f.game_name_roman}
            onChange={(e) => u("game_name_roman", e.target.value)}
            placeholder="Romanised title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Game Name JP">
          <input
            className={inputCls}
            value={f.game_name_jp}
            onChange={(e) => u("game_name_jp", e.target.value)}
            placeholder="Japanese title"
          />
        </Field>
        <Field label="Game Name Alt">
          <input
            className={inputCls}
            value={f.game_name_alt}
            onChange={(e) => u("game_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-sitemap" title="Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Game Type">
          <select
            className={selectCls}
            value={f.game_type}
            onChange={(e) => u("game_type", e.target.value)}
          >
            <option value="">—</option>
            {GAME_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {/* GAME_IS_MAIN - a label of its own, independent of game_type and of
            the Remake / Remaster relation kinds. */}
        <Field label="Main / Remake">
          <select
            className={selectCls}
            aria-label="Main / Remake"
            value={f.is_main ?? ""}
            onChange={(e) => u("is_main", e.target.value)}
          >
            <option value="">—</option>
            {GAME_IS_MAIN.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {/* A base game only makes sense for a DLC, expansion or bundle -
            ck_games_base_no_parent rejects one on a Base Game row. */}
        <Field
          label="Base Game"
          hint={
            f.game_type === "Base Game"
              ? "Base games have no parent"
              : "The game this hangs off"
          }
        >
          <ComboBox
            items={baseGameChoices.map((g) => ({
              id: g.system_id,
              label: getDisplayName(g, "game"),
              searchText: [
                g.game_name_cn,
                g.game_name_en,
                g.game_name_roman,
                g.game_name_jp,
                g.game_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
            selectedId={f.base_game_id}
            inputText={
              baseGameChoices.find((g) => g.system_id === f.base_game_id)
                ? getDisplayName(
                    baseGameChoices.find(
                      (g) => g.system_id === f.base_game_id,
                    ),
                    "game",
                  )
                : ""
            }
            onSelect={(id) => u("base_game_id", id)}
            onType={() => u("base_game_id", null)}
            onClear={() => u("base_game_id", null)}
            placeholder="Search a base game..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Genre">
          {tagField(
            "game_genre",
            { kind: "option", category: "Game Genre", scope: "game" },
            "Select or type genre...",
          )}
        </Field>
        <Field label="Theme">
          {tagField(
            "game_theme",
            { kind: "option", category: "Game Theme", scope: "game" },
            "Select or type theme...",
          )}
        </Field>
        <Field label="Platform" hint="Which platform the game is on">
          {tagField(
            "game_platform",
            { kind: "option", category: "Game Platform", scope: "game" },
            "PlayStation, PC...",
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Mode">
          {tagField(
            "game_mode",
            { kind: "option", category: "Game Mode", scope: "game" },
            "Single player, Co-op...",
          )}
        </Field>
        <Field label="Combat Mode">
          {tagField(
            "combat_mode",
            { kind: "option", category: "Combat Mode", scope: "game" },
            "PvE, PvP...",
          )}
        </Field>
        <Field label="Label">
          {tagField(
            "label",
            { kind: "option", category: "Label", scope: "game" },
            "Select or type label...",
          )}
        </Field>
      </div>

      {/* Rating sits directly under Classification: the verdicts on a game -
          mine and the public's - read before its play state does. My rating
          is the S..F scale; the two Metacritic figures are Metacritic's own. */}
      <SectionHeader icon="fa-star" title="Rating" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={f.my_rating}
            onChange={(e) => u("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {MY_RATINGS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {num("metacritic_score", "Metacritic", "Critic metascore, 0-100")}
        {num("metacritic_user_score", "Metacritic User", "User score, 0-10")}
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Release Status">
          <select
            className={selectCls}
            value={f.release_status}
            onChange={(e) => u("release_status", e.target.value)}
          >
            <option value="">—</option>
            {GAME_RELEASE_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Playing Status">
          <select
            className={selectCls}
            value={f.playing_status}
            onChange={(e) => u("playing_status", e.target.value)}
          >
            <StatusOptions statuses={PLAYING_STATUSES} />
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Completion Level">
          <select
            className={selectCls}
            value={f.completion_level}
            onChange={(e) => u("completion_level", e.target.value)}
          >
            <option value="">—</option>
            {COMPLETION_LEVELS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Current Patch" hint="e.g. 1.6.2">
          <input
            className={inputCls}
            value={f.current_patch}
            onChange={(e) => u("current_patch", e.target.value)}
            placeholder="1.6.2"
          />
        </Field>
      </div>
      {/* Three vocabulary axes, independent of the ladder above and of each
          other. "All Achievements" is not read from the counts below.
          "Inapplicable" is for a game that has none of that thing at all -
          no endings to see, no achievement list, nothing to collect - which
          is a different answer from "No" and from leaving it blank. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="All Endings" hint="Separate axis from completion level">
          <select
            className={selectCls}
            value={f.all_endings}
            onChange={(e) => u("all_endings", e.target.value)}
          >
            <option value="">—</option>
            {GAME_COMPLETION_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                {flag}
              </option>
            ))}
          </select>
        </Field>
        <Field label="All Achievements">
          <select
            className={selectCls}
            value={f.all_achievements}
            onChange={(e) => u("all_achievements", e.target.value)}
          >
            <option value="">—</option>
            {GAME_COMPLETION_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                {flag}
              </option>
            ))}
          </select>
        </Field>
        <Field label="All Collected" hint="Every in-game collectible">
          <select
            className={selectCls}
            value={f.all_collected}
            onChange={(e) => u("all_collected", e.target.value)}
          >
            <option value="">—</option>
            {GAME_COMPLETION_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                {flag}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Steam Progress Sync" hint="Off: Steam never writes playtime here">
          <select
            className={selectCls}
            value={f.steam_progress_sync}
            onChange={(e) => u("steam_progress_sync", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-list-ol" title="Progress" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hours_played", "Hours Played")}
        {num("achievements_earned", "Achievements Earned")}
        {num("achievements_total", "Achievements Total")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hltb_main", "HLTB Main", "Hours, filled from IGDB")}
        {num("hltb_main_extra", "HLTB Main + Extra", "Hours")}
        {num("hltb_completionist", "HLTB Completionist", "Hours")}
      </div>

      <SectionHeader icon="fa-pen-nib" title="Credits" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Developer" hint="A studio row, quick-created if new">
          {tagField("studio", { kind: "studio" }, "Select or type developer...")}
        </Field>
        <Field label="Publisher" hint="A publisher row, quick-created if new">
          {tagField(
            "publisher",
            { kind: "publisher" },
            "Select or type publisher...",
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Director">
          {tagField(
            "director",
            { kind: "person", role: "director", scope: "game" },
            "Select or type director...",
          )}
        </Field>
        <Field label="Composer">
          {tagField(
            "composer",
            { kind: "person", role: "composer", scope: "game" },
            "Select or type composer...",
          )}
        </Field>
      </div>

      <SectionHeader icon="fa-calendar" title="Release & Prices" />
      <ReleaseDateInput
        label="Release Date"
        value={f.release_date}
        onChange={(v) => u("release_date", v)}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("price_original_us", "MSRP (US)")}
        {num("price_original_jp", "MSRP (JP)")}
        {num("price_original_tw", "MSRP (TW)")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("price_current_us", "Current Price (US)")}
        {num("price_current_jp", "Current Price (JP)")}
        {num("price_current_tw", "Current Price (TW)")}
      </div>

      {/* A copy is a personal-ownership row that happens to be edited from a
          catalogue form, so it is gated on self.list rather than on the
          manage.catalog this page already required. An administrative
          account edits the game without acquiring a copy of it; the server
          skips a `copies` payload from such a caller for the same reason
          (services/domain/game_copies.py). */}
      {canOwnCopies && (
        <>
          <SectionHeader icon="fa-box-open" title="Copies" />
          <Field
            label="Copies"
            hint="One row per copy owned or wanted — Ownership on the entry is derived from these"
          >
            <GameCopiesEditor
              items={f.copies}
              onChange={(v) => u("copies", v)}
            />
          </Field>
        </>
      )}

      <SectionHeader icon="fa-external-link-alt" title="Sources" />
      {/* The id, not the link, is what Fill runs on. The public IGDB URL
          carries a slug, so nothing can derive one from the other - both are
          typed, or both come from the picker on the Add page. */}
      <Field
        label="IGDB ID"
        hint="Fill Game pulls genres, themes, companies, time-to-beat and the parent game from it — the link alone is not enough"
      >
        <input
          type="number"
          className={inputCls}
          value={f.igdb_id}
          onChange={(e) => u("igdb_id", e.target.value)}
          placeholder="119133"
        />
      </Field>
      <Field label="IGDB Link">
        <input
          className={inputCls}
          value={f.igdb_link}
          onChange={(e) => u("igdb_link", e.target.value)}
          placeholder="https://www.igdb.com/games/elden-ring"
        />
      </Field>
      <Field label="Steam AppID" hint="Reserved for the Steam sync">
        <input
          type="number"
          className={inputCls}
          value={f.steam_appid}
          onChange={(e) => u("steam_appid", e.target.value)}
          placeholder="1245620"
        />
      </Field>
      <Field label="Steam Link">
        <input
          className={inputCls}
          value={f.steam_link}
          onChange={(e) => u("steam_link", e.target.value)}
          placeholder="https://store.steampowered.com/app/1245620/"
        />
      </Field>
      {/* No access group: where a game can be played is the Platform tag,
          and which copy was bought is the Copies editor. */}
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="game"
        sources={sources}
        showAccess={false}
      />

      <SectionHeader icon="fa-flag" title="Flags" />
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Play Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.play_next}
              onChange={(e) => u("play_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Add to Play Next list
            </span>
          </label>
        </Field>
        <Field label="To Replay">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.to_replay}
              onChange={(e) => u("to_replay", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Mark for replay
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image">
        <ImagePicker
          ownerType="game"
          ownerId={ownerId}
          role="cover"
          value={f.cover_image_file}
          focus={f.cover_image_focus}
          onFocusChange={(focus) => u("cover_image_focus", focus)}
          onChange={(key, imageId) => {
            u("cover_image_file", key);
            u("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={f.remark}
          onChange={(e) => u("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </>
  );
}

/** The franchise and series pickers, shared by both game tabs. */
export function GameLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForGame,
  franchiseCollections,
}) {
  return (
    <>
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (fr) =>
                parseTypes(fr.franchise_type).includes("Game") ||
                !fr.franchise_type,
            )
            .map((fr) => ({
              id: fr.system_id,
              label: getDisplayName(fr, "franchise"),
              searchText: [
                fr.franchise_name_en,
                fr.franchise_name_cn,
                fr.franchise_name_roman,
                fr.franchise_name_jp,
                fr.franchise_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
          selectedId={f.franchise_id}
          inputText={f.franchise_text}
          onSelect={(id, label) => {
            u("franchise_id", id);
            u("franchise_text", label);
            u("series_id", null);
            u("series_text", "");
          }}
          onType={(text) => {
            u("franchise_text", text);
            u("franchise_id", null);
            u("series_id", null);
            u("series_text", "");
          }}
          onClear={() => {
            u("franchise_id", null);
            u("franchise_text", "");
            u("series_id", null);
            u("series_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={f.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForGame}
          selectedId={f.series_id}
          inputText={f.series_text}
          onSelect={(id, label) => {
            u("series_id", id);
            u("series_text", label);
          }}
          onType={(text) => {
            u("series_text", text);
            u("series_id", null);
          }}
          onClear={() => {
            u("series_id", null);
            u("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
    </>
  );
}

export default function GameAddTab({
  franchiseCollections,
  gmf,
  ugm,
  allFranchises,
  allGames,
  gamesLoading = false,
  seriesItemsForGame,
  sources,
  applyGameEntryAutofill,
  applyIgdbPick,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      {/* Two boxes, two sources: this one copies fields from a game already
          in the catalogue, the IGDB one below links the new entry to its
          IGDB record. */}
      <EntryAutofillSearch
        items={allGames}
        names={(g) => [
          g.game_name_cn,
          g.game_name_en,
          g.game_name_roman,
          g.game_name_jp,
          g.game_name_alt,
        ]}
        title={(g) => getDisplayName(g, "game")}
        franchises={allFranchises}
        onPick={applyGameEntryAutofill}
        loading={gamesLoading}
      />
      <ExternalSearchBox
        source="IGDB"
        searchUrl={endpoints.game.searchIgdb}
        onPick={applyIgdbPick}
      />
      <SectionHeader icon="fa-gamepad" title="Titles & Naming" />
      <GameLineageFields
        f={gmf}
        u={ugm}
        allFranchises={allFranchises}
        seriesItemsForGame={seriesItemsForGame}
        franchiseCollections={franchiseCollections}
      />
      <GameFormBody f={gmf} u={ugm} allGames={allGames} sources={sources} />
    </div>
  );
}
