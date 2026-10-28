// Frontend: add tab page file for HGameAddTab.
//
// The form of the gated h-game type, shared by the Add and Modify tabs the
// way GameAddTab's is: this file exports the field body and the lineage
// pickers, and HGameModifyTab renders them, so the two cannot drift.
//
// It is Game's form, reshaped for what h_game holds: no playtime, Metacritic,
// achievement or collectible flags, and one credit (the developer); plus the
// play style, All CG, usefulness, the language / audio / animation /
// H-presentation / platform fields and the two DLsite links. The IGDB search
// is the shared ExternalSearchBox, pointed at /api/h-game/search-igdb.
import ComboBox from "../../components/forms/ComboBox";
import EntryAutofillSearch from "../../components/forms/EntryAutofillSearch";
import FamilyLineageFields from "../../components/forms/FamilyLineageFields";
import ExternalSearchBox from "../../components/forms/ExternalSearchBox";
import ChoiceChips from "../../components/forms/ChoiceChips";
import GameCopiesEditor from "../../components/forms/GameCopiesEditor";
import MultiSelect from "../../components/forms/MultiSelect";
import SourcesEditor from "../../components/forms/SourcesEditor";
import TagReplace from "../../components/forms/TagReplace";
import CoverRemarkFields from "../../components/forms/CoverRemarkFields";
import EntryFlags from "../../components/forms/EntryFlags";
import EntryNameFields from "../../components/forms/EntryNameFields";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import StatusOptions from "../../components/ui/StatusOptions";
import { getDisplayName, getSourceValues } from "../../utils/media";
import { getIdleSourceValues } from "../../lib/formatters";
import { RESTRICTED_FAMILY } from "../../lib/gatedTypes";
import {
  COMPLETION_LEVELS,
  GAME_COMPLETION_FLAGS,
  GAME_IS_MAIN,
  GAME_RELEASE_STATUSES,
  GAME_TYPES,
  H_COMIC_USEFULNESS,
  H_GAME_ART_STYLES,
  H_GAME_AUDIO_AVAILABILITY,
  H_GAME_H_ART_STYLES,
  H_GAME_H_PRESENTATIONS,
  H_GAME_LANGUAGE_AVAILABILITY,
  H_GAME_PLATFORMS,
  H_GAME_PLAYSTYLES,
  MY_RATINGS,
  PLAYING_STATUSES,
} from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";

export { defaultHGame } from "../../config/formFactories";

// The franchise type a new h-game franchise is created with. The picker
// offers the whole restricted family (FamilyLineageFields), so an h-game can
// join a doujin franchise holding h-comics and hentai.
export const H_GAME_FRANCHISE_TYPE = "H-Game";

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

const nameSearchText = (g) =>
  [g.h_game_name_cn, g.h_game_name_en, g.h_game_name_roman, g.h_game_name_jp, g.h_game_name_alt]
    .filter(Boolean)
    .join(" ");

/**
 * Every field below the lineage pickers, shared verbatim by the Modify tab.
 * `ownerId` is passed by the Modify tab only, where the row exists; without
 * it a picked cover waits in `pending_image_id` for the Add page to attach
 * once the entry is saved.
 */
export function HGameFormBody({ f, u, allHGames = [], excludeId, sources, ownerId }) {
  const { has } = useAuth();
  const canOwnCopies = has("self.list");
  // ck_h_game_not_self_parent: an h-game is never its own base game. The
  // base game is an h-game - the self-FK is on h_game - so only h-games are
  // offered.
  const baseGameChoices = excludeId
    ? allHGames.filter((g) => g.system_id !== excludeId)
    : allHGames;
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
  // "" / "true" / "false": the form's tristate for a nullable boolean.
  const tristate = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <select
        className={selectCls}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </Field>
  );
  const choices = (key, label, options, hint) => (
    <Field label={label} hint={hint}>
      <ChoiceChips
        label={label}
        options={options}
        value={f[key] ?? null}
        onChange={(v) => u(key, v)}
      />
    </Field>
  );

  return (
    <>
      <EntryNameFields f={f} u={u} prefix="h_game" label="H-Game" />

      <SectionHeader icon="fa-chart-bar" title="My Tracker" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        {/* Personal, like the rating: how useful it was to me. */}
        {select("usefulness", "Usefulness", H_COMIC_USEFULNESS)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("achievements_earned", "Achievements Earned")}
        {num("achievements_total", "Achievements Total")}
        {tristate("steam_progress_sync", "Steam Progress Sync", "Off: Steam never writes achievements here")}
      </div>
      {/* The completion ladder and two vocabulary axes beside it, as on Game. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {select("completion_level", "Completion Level", COMPLETION_LEVELS)}
        {select("all_endings", "All Endings", GAME_COMPLETION_FLAGS, "Separate axis from completion level")}
        {select("all_cg", "All CG", GAME_COMPLETION_FLAGS, "Every CG unlocked")}
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
        {select("is_main", "Main / Remake", GAME_IS_MAIN)}
        {select("game_type", "Game Type", GAME_TYPES)}
        {/* A base game only makes sense for a DLC, expansion or bundle -
            ck_h_game_base_no_parent rejects one on a Base Game row. */}
        <Field
          label="Base Game"
          hint={f.game_type === "Base Game" ? "Base games have no parent" : "The h-game this hangs off"}
        >
          <ComboBox
            items={baseGameChoices.map((g) => ({
              id: g.system_id,
              label: getDisplayName(g, "h-game"),
              searchText: nameSearchText(g),
            }))}
            selectedId={f.base_game_id}
            inputText={baseGame ? getDisplayName(baseGame, "h-game") : ""}
            onSelect={(id) => u("base_game_id", id)}
            onType={() => u("base_game_id", null)}
            onClear={() => u("base_game_id", null)}
            placeholder="Search a base h-game..."
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
        {text("current_patch", "Current Patch", "1.0.2", "e.g. 1.0.2")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hltb_main", "HLTB Main", "Hours, filled from IGDB")}
        {num("hltb_main_extra", "HLTB Main + Extra", "Hours")}
        {num("hltb_completionist", "HLTB Completionist", "Hours")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {select("playstyle", "Play Style", H_GAME_PLAYSTYLES)}
        {num("series_number", "Series Number", "Its place in its series")}
        {select("language_availability", "Language", H_GAME_LANGUAGE_AVAILABILITY)}
      </div>
      {/* Where it is sold, set by hand - not Game's hardware Platform tag,
          and never filled from IGDB. */}
      {choices("platform", "Platform", H_GAME_PLATFORMS, "Where it is sold")}

      <SectionHeader icon="fa-tags" title="Genres" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Genre">
          {tagField(
            "game_genre",
            { kind: "option", category: "Game Genre", scope: "h-game" },
            "Select or type genre..."
          )}
        </Field>
        <Field label="Theme">
          {tagField(
            "game_theme",
            { kind: "option", category: "Game Theme", scope: "h-game" },
            "Select or type theme..."
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Genre Plot">
          {tagField(
            "h_genre_plot",
            { kind: "option", category: "H Genre Plot", scope: "h-game" },
            "Select or type genre..."
          )}
        </Field>
        <Field label="Genre Appearance">
          {tagField(
            "h_genre_appearance",
            { kind: "option", category: "H Genre Appearance", scope: "h-game" },
            "Select or type genre..."
          )}
        </Field>
        <Field label="Genre Relation">
          {tagField(
            "h_genre_relation",
            { kind: "option", category: "H Genre Relation", scope: "h-game" },
            "Select or type genre..."
          )}
        </Field>
      </div>
      <TagReplace
        mediaType="h-game"
        franchiseId={f.franchise_id}
        seriesId={f.series_id}
        entryId={ownerId}
        fields={["game_genre", "h_genre_plot", "h_genre_appearance", "h_genre_relation"]}
        what="genres"
        onChange={u}
      />

      {/* The fixed sets, in the detail page's order. None and Unknown are two
          different answers (ChoiceChips). Dialogue audio and sound effect
          share one vocabulary. */}
      <SectionHeader icon="fa-layer-group" title="Presentation" />
      {choices("art_style", "Art Style", H_GAME_ART_STYLES, "What the game looks like")}
      {choices("h_art_style", "H 演出 Art Style", H_GAME_H_ART_STYLES, "What the H scenes look like")}
      {choices("h_presentation", "H 演出形式", H_GAME_H_PRESENTATIONS)}
      {choices("dialogue_audio", "Dialogue Audio", H_GAME_AUDIO_AVAILABILITY, "Which parts are voiced")}
      {choices("sound_effect", "Sound Effect", H_GAME_AUDIO_AVAILABILITY, "Which parts have sound effects")}

      <SectionHeader icon="fa-pen-nib" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Developer" hint="A studio row, quick-created if new">
          {tagField("studio", { kind: "studio" }, "Select or type developer...")}
        </Field>
      </div>

      <SectionHeader icon="fa-tag" title="Prices" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("price_original_us", "MSRP (US)")}
        {num("price_original_jp", "MSRP (JP)")}
        {num("price_original_tw", "MSRP (TW)")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      </div>

      {/* Game's purchase records - the same game_copy rows, gated on
          self.list for Game's reason (GameAddTab). */}
      {canOwnCopies && (
        <>
          <SectionHeader icon="fa-box-open" title="Copies" />
          <Field
            label="Copies"
            hint="One row per copy owned or wanted — Ownership on the entry is derived from these"
          >
            <GameCopiesEditor items={f.copies} onChange={(v) => u("copies", v)} />
          </Field>
        </>
      )}

      <SectionHeader icon="fa-external-link-alt" title="Links & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="IGDB ID"
          hint="Fill pulls genres, themes, the developer, time-to-beat and the parent game from it"
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
        {text("igdb_link", "IGDB Link", "https://www.igdb.com/games/...")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Steam AppID" hint="Steam fills prices and achievements from it">
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
        {text("steam_link", "Steam Link", "https://store.steampowered.com/app/...")}
      </div>
      {/* The DLsite fill reads the product id out of these links (JP first,
          then TW) - there is no id field beside them. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text("dlsite_link_jp", "DLsite Link (JP)", "https://www.dlsite.com/maniax/work/=/product_id/...")}
        {text("dlsite_link_tw", "DLsite Link (TW)", "https://www.dlsite.com/maniax/work/=/product_id/....html/?locale=zh_TW")}
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="h-game"
        sources={sources}
        showAccess={false}
      />

      <CoverRemarkFields f={f} u={u} ownerType="h-game" ownerId={ownerId} />
    </>
  );
}

/**
 * The franchise and series pickers, shared by both h-game tabs. The
 * restricted family's franchises only - H-Game, and H-Comic and Hentai, which
 * an h-game may share in one doujin franchise.
 */
export function HGameLineageFields({ f, u, allFranchises, seriesItemsForHGame, franchiseCollections }) {
  return (
    <FamilyLineageFields
      f={f}
      u={u}
      family={RESTRICTED_FAMILY}
      hint="H-Game, H-Comic and Hentai franchises only"
      allFranchises={allFranchises}
      seriesItems={seriesItemsForHGame}
      franchiseCollections={franchiseCollections}
    />
  );
}

export default function HGameAddTab({
  franchiseCollections,
  hgf,
  uhg,
  allFranchises,
  allHGames,
  hGamesLoading,
  seriesItemsForHGame,
  sources,
  applyIgdbPick,
  applyHGameEntryAutofill,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      {/* Two boxes, two sources: this one copies fields from an h-game
          already in the catalogue, the IGDB one below links the new entry
          to its IGDB record. */}
      <EntryAutofillSearch
        items={allHGames}
        names={(g) => [
          g.h_game_name_cn,
          g.h_game_name_en,
          g.h_game_name_roman,
          g.h_game_name_jp,
          g.h_game_name_alt,
        ]}
        title={(g) => getDisplayName(g, "h-game")}
        franchises={allFranchises}
        onPick={applyHGameEntryAutofill}
        loading={hGamesLoading}
      />
      <ExternalSearchBox
        source="IGDB"
        searchUrl={endpoints.hGame.searchIgdb}
        onPick={applyIgdbPick}
      />
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <HGameLineageFields
        f={hgf}
        u={uhg}
        allFranchises={allFranchises}
        seriesItemsForHGame={seriesItemsForHGame}
        franchiseCollections={franchiseCollections}
      />
      <HGameFormBody f={hgf} u={uhg} allHGames={allHGames} sources={sources} />
    </div>
  );
}
