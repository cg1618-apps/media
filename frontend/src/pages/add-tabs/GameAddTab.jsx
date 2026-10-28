// Frontend: add tab page file for GameAddTab.
//
// Two boxes at the top, as on every media tab: EntryAutofillSearch copies
// fields from a game already in the catalogue, and the IGDB search under it
// links the new entry to its IGDB record - the IGDB id it stores is Fill's
// only handle on the game. Everything else comes from the Fill pipeline, and
// the base game has its own picker below.
//
// The field body and the lineage pickers are exported and rendered by
// GameModifyTab too, so the two pages share one form in the canonical
// entry-form section order.
import ComboBox from "../../components/forms/ComboBox";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import GameCopiesEditor from "../../components/forms/GameCopiesEditor";
import MultiSelect from "../../components/forms/MultiSelect";
import SourcesEditor from "../../components/forms/SourcesEditor";
import TagReplace from "../../components/forms/TagReplace";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import { getIdleSourceValues } from "../../lib/formatters";
import {
  COMPLETION_LEVELS,
  GAME_ACHIEVEMENT_FLAGS,
  GAME_ACHIEVEMENT_HINT,
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

function Options({ values }) {
  return (
    <>
      <option value="">—</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </>
  );
}

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `f` is the form state and `u` its updater, so the two pages
 * differ only in which state object they hand in.
 *
 * `ownerId` is only passed by GameModifyTab, where the game row already
 * exists. Without it a picked cover waits in `pending_image_id` for the Add
 * page to attach once the game is saved (CoverRemarkFields).
 */
export function GameFormBody({ f, u, allGames, excludeGameId, sources, ownerId }) {
  const { has } = useAuth();
  const canOwnCopies = has("self.list");
  // ck_games_not_self_parent: a game can never be its own base game, so the
  // row being edited is never offered as a parent.
  const baseGameChoices = excludeGameId
    ? allGames.filter((g) => g.system_id !== excludeGameId)
    : allGames;
  const baseGame = baseGameChoices.find((g) => g.system_id === f.base_game_id);

  const tagField = (key, source, placeholder) => (
    <MultiSelect
      options={getSourceValues(sources, source)}
      idleOptions={getIdleSourceValues(sources, source)}
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
        min="0"
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder="0"
      />
    </Field>
  );
  const text = (key, label, placeholder, hint) => (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
  const select = (key, label, values, hint) => (
    <Field label={label} hint={hint}>
      <select
        className={selectCls}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
      >
        <Options values={values} />
      </select>
    </Field>
  );

  return (
    <>
      <EntryNameFields f={f} u={u} prefix="game" label="Game" />

      {/* Metacritic's own figures; my rating is in My Tracker. */}
      <SectionHeader icon="fa-star" title="Scores" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {num("metacritic_score", "Metacritic", "Critic metascore, 0-100")}
        {num("metacritic_user_score", "Metacritic User", "User score, 0-10")}
      </div>

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Playing Status">
          <select
            className={selectCls}
            aria-label="Playing Status"
            value={f.playing_status ?? ""}
            onChange={(e) => u("playing_status", e.target.value)}
          >
            <StatusOptions statuses={PLAYING_STATUSES} />
          </select>
        </Field>
        {select("my_rating", "My Rating", MY_RATINGS)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {num("hours_played", "Hours Played")}
        {num("achievements_earned", "Achievements Earned")}
        {num("achievements_total", "Achievements Total")}
        <Field label="Steam Progress Sync" hint="Off: Steam never writes playtime here">
          <select
            className={selectCls}
            aria-label="Steam Progress Sync"
            value={f.steam_progress_sync ?? ""}
            onChange={(e) => u("steam_progress_sync", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
      </div>
      {/* The completion ladder, then three vocabulary axes independent of it
          and of each other. "All Achievements" is not read from the counts
          above, and reads its own vocabulary: "Fully" counts the hidden
          achievements, "Yes" all but those. "Inapplicable" is for a game that has none of that thing at
          all - no endings to see, no achievement list, nothing to collect -
          which is a different answer from "No" and from leaving it blank. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {select("completion_level", "Completion Level", COMPLETION_LEVELS)}
        {select(
          "all_endings",
          "All Endings",
          GAME_COMPLETION_FLAGS,
          "Separate axis from completion level",
        )}
        {select(
          "all_achievements",
          "All Achievements",
          GAME_ACHIEVEMENT_FLAGS,
          GAME_ACHIEVEMENT_HINT,
        )}
        {select(
          "all_collected",
          "All Collected",
          GAME_COMPLETION_FLAGS,
          "Every in-game collectible",
        )}
      </div>
      <EntryFlags
        f={f}
        u={u}
        flags={[
          ["play_next", "Play Next", "Add to Play Next list"],
          ["to_replay", "To Replay", "Mark for replay"],
        ]}
      />

      <SectionHeader icon="fa-info-circle" title="Information" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* GAME_IS_MAIN - a label of its own, independent of game_type and of
            the Remake / Remaster relation kinds. */}
        {select("is_main", "Main / Remake", GAME_IS_MAIN)}
        {select("game_type", "Game Type", GAME_TYPES)}
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
            inputText={baseGame ? getDisplayName(baseGame, "game") : ""}
            onSelect={(id) => u("base_game_id", id)}
            onType={() => u("base_game_id", null)}
            onClear={() => u("base_game_id", null)}
            placeholder="Search a base game..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {select("release_status", "Release Status", GAME_RELEASE_STATUSES)}
        <ReleaseDateInput
          label="Release Date"
          value={f.release_date}
          onChange={(v) => u("release_date", v)}
        />
        {text("current_patch", "Current Patch", "1.6.2", "e.g. 1.6.2")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hltb_main", "HLTB Main", "Hours, filled from IGDB")}
        {num("hltb_main_extra", "HLTB Main + Extra", "Hours")}
        {num("hltb_completionist", "HLTB Completionist", "Hours")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Platform" hint="Which platform the game is on">
          {tagField(
            "game_platform",
            { kind: "option", category: "Game Platform", scope: "game" },
            "PlayStation, PC...",
          )}
        </Field>
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
      </div>

      <SectionHeader icon="fa-tags" title="Genres & Labels" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
      <Field label="Label">
        {tagField(
          "label",
          { kind: "option", category: "Label", scope: "game" },
          "Select or type label...",
        )}
      </Field>
      <TagReplace
        mediaType="game"
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
        fields={["game_genre", "label"]}
        onChange={u}
      />

      <SectionHeader icon="fa-pen-nib" title="Production" />
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

      <SectionHeader icon="fa-tag" title="Prices" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("price_original_us", "MSRP (US)")}
        {num("price_original_jp", "MSRP (JP)")}
        {num("price_original_tw", "MSRP (TW)")}
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

      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      {/* The id, not the link, is what Fill runs on. The public IGDB URL
          carries a slug, so nothing can derive one from the other - both are
          typed, or both come from the picker on the Add page. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="IGDB ID"
          hint="Fill Game pulls genres, themes, companies, time-to-beat and the parent game from it — the link alone is not enough"
        >
          <input
            type="number"
            min="0"
            className={inputCls}
            aria-label="IGDB ID"
            value={f.igdb_id ?? ""}
            onChange={(e) => u("igdb_id", e.target.value)}
            placeholder="119133"
          />
        </Field>
        {text("igdb_link", "IGDB Link", "https://www.igdb.com/games/elden-ring")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Steam AppID" hint="Reserved for the Steam sync">
          <input
            type="number"
            min="0"
            className={inputCls}
            aria-label="Steam AppID"
            value={f.steam_appid ?? ""}
            onChange={(e) => u("steam_appid", e.target.value)}
            placeholder="1245620"
          />
        </Field>
        {text("steam_link", "Steam Link", "https://store.steampowered.com/app/1245620/")}
      </div>
      {/* No access group: where a game can be played is the Platform tag,
          and which copy was bought is the Copies editor. */}
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="game"
        sources={sources}
        showAccess={false}
      />

      <CoverRemarkFields f={f} u={u} ownerType="game" ownerId={ownerId} />
    </>
  );
}

/** The franchise and series pickers, shared by both game tabs: Game and
 *  untyped franchises only. */
export function GameLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForGame,
  franchiseCollections,
}) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      accepts={(type) => !type || parseTypes(type).includes("Game")}
      allFranchises={allFranchises}
      seriesItems={seriesItemsForGame}
      franchiseCollections={franchiseCollections}
    />
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
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
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
