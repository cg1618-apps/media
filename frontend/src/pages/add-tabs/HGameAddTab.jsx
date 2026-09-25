// Frontend: add tab page file for HGameAddTab.
//
// The form of the gated h-game type, shared by the Add and Modify tabs the
// way GameAddTab's is: this file exports the field body and the lineage
// pickers, and HGameModifyTab renders them, so the two cannot drift.
//
// It is Game's form, reshaped for what h_game holds: no playtime, Metacritic,
// achievement or collectible flags, and one credit (the developer); plus the
// play style, All CG, usefulness, the language / audio / animation /
// H-presentation / platform fields and the two DLsite links. The IGDB picker
// is Game's, pointed at /api/h-game/search-igdb.
import ComboBox from "../../components/forms/ComboBox";
import ChoiceChips from "../../components/forms/ChoiceChips";
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
import StatusOptions from "../../components/ui/StatusOptions";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import {
  COMPLETION_LEVELS,
  GAME_COMPLETION_FLAGS,
  GAME_RELEASE_STATUSES,
  GAME_TYPES,
  H_COMIC_USEFULNESS,
  H_GAME_AUDIO_AVAILABILITY,
  H_GAME_H_PRESENTATIONS,
  H_GAME_LANGUAGE_AVAILABILITY,
  H_GAME_PLATFORMS,
  H_GAME_PLAYSTYLES,
  MY_RATINGS,
  PLAYING_STATUSES,
} from "../../config/fieldOptions";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { IgdbSearchBox } from "./GameAddTab";

export { defaultHGame } from "../../config/formFactories";

// The one franchise type an h-game may sit in: H-Game is a franchise family
// of its own, so the server refuses any other and the picker offers no other.
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
      {text("h_game_name_cn", "H-Game Name CN", "Chinese title")}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text("h_game_name_en", "H-Game Name EN", "English title")}
        {text("h_game_name_roman", "H-Game Name Romaji", "Romanised title")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text("h_game_name_jp", "H-Game Name JP", "Japanese title")}
        {text("h_game_name_alt", "H-Game Name Alt", "Alternative title")}
      </div>

      <SectionHeader icon="fa-sitemap" title="Classification" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("playstyle", "Play Style", H_GAME_PLAYSTYLES)}
        {num("series_number", "Series Number", "Its place in its series")}
      </div>
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

      {/* The fixed vocabularies. Language and animation are one answer each;
          the other three are sets, where None and Unknown are two different
          answers (ChoiceChips). Platform is where it is sold, set by hand -
          not Game's hardware Platform tag, and never filled from IGDB. */}
      <SectionHeader icon="fa-layer-group" title="Content" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("language_availability", "Language", H_GAME_LANGUAGE_AVAILABILITY)}
        {tristate("animation_availability", "Animation", "Whether it has animated scenes")}
      </div>
      {choices("audio_availability", "Audio", H_GAME_AUDIO_AVAILABILITY, "Which parts are voiced")}
      {choices("h_presentation", "H 演出形式", H_GAME_H_PRESENTATIONS)}
      {choices("platform", "Platform", H_GAME_PLATFORMS, "Where it is sold")}

      <SectionHeader icon="fa-star" title="Rating" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("my_rating", "My Rating", MY_RATINGS)}
        {/* Personal, like the rating: how useful it was to me. */}
        {select("usefulness", "Usefulness", H_COMIC_USEFULNESS)}
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("release_status", "Release Status", GAME_RELEASE_STATUSES)}
        <Field label="Playing Status">
          <select
            className={selectCls}
            aria-label="Playing Status"
            value={f.playing_status}
            onChange={(e) => u("playing_status", e.target.value)}
          >
            <StatusOptions statuses={PLAYING_STATUSES} />
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {select("completion_level", "Completion Level", COMPLETION_LEVELS)}
        {text("current_patch", "Current Patch", "1.0.2", "e.g. 1.0.2")}
      </div>
      {/* Two vocabulary axes beside the ladder above, as on Game. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {select("all_endings", "All Endings", GAME_COMPLETION_FLAGS, "Separate axis from completion level")}
        {select("all_cg", "All CG", GAME_COMPLETION_FLAGS, "Every CG unlocked")}
        {tristate("steam_progress_sync", "Steam Progress Sync", "Off: Steam never writes achievements here")}
      </div>

      <SectionHeader icon="fa-list-ol" title="Progress" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {num("achievements_earned", "Achievements Earned")}
        {num("achievements_total", "Achievements Total")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hltb_main", "HLTB Main", "Hours, filled from IGDB")}
        {num("hltb_main_extra", "HLTB Main + Extra", "Hours")}
        {num("hltb_completionist", "HLTB Completionist", "Hours")}
      </div>

      <SectionHeader icon="fa-pen-nib" title="Credits" />
      <Field label="Developer" hint="A studio row, quick-created if new">
        {tagField("studio", { kind: "studio" }, "Select or type developer...")}
      </Field>

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

      <SectionHeader icon="fa-external-link-alt" title="Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="IGDB ID"
          hint="Fill pulls genres, themes, the developer, time-to-beat and the parent game from it"
        >
          <input
            type="number"
            className={inputCls}
            aria-label="IGDB ID"
            value={f.igdb_id}
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
            className={inputCls}
            aria-label="Steam AppID"
            value={f.steam_appid}
            onChange={(e) => u("steam_appid", e.target.value)}
            placeholder="1245620"
          />
        </Field>
        {text("steam_link", "Steam Link", "https://store.steampowered.com/app/...")}
      </div>
      {/* Plain links: nothing fetches DLsite. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {text("dlsite_link_jp", "DLsite Link (JP)", "https://www.dlsite.com/maniax/work/=/product_id/...")}
        {text("dlsite_link_tw", "DLsite Link (TW)", "https://www.dlsite.com/...")}
      </div>
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="h-game"
        sources={sources}
        showAccess={false}
      />

      <SectionHeader icon="fa-flag" title="Flags" />
      <div className="flex flex-wrap gap-6 mt-2">
        {[
          ["play_next", "Play Next", "Add to Play Next list"],
          ["to_replay", "To Replay", "Mark for replay"],
        ].map(([key, label, caption]) => (
          <Field key={key} label={label}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!f[key]}
                onChange={(e) => u(key, e.target.checked)}
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm font-medium text-text-muted">{caption}</span>
            </label>
          </Field>
        ))}
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image">
        <ImagePicker
          ownerType="h-game"
          ownerId={ownerId}
          role="cover"
          value={f.cover_image_file}
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

/** The franchise and series pickers, shared by both h-game tabs. */
export function HGameLineageFields({ f, u, allFranchises, seriesItemsForHGame, franchiseCollections }) {
  return (
    <>
      <Field label="Franchise" hint="H-Game franchises only">
        <ComboBox
          items={allFranchises
            .filter((fr) => parseTypes(fr.franchise_type).includes(H_GAME_FRANCHISE_TYPE))
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
          onType={(t) => {
            u("franchise_text", t);
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
        <CollectionNote franchiseId={f.franchise_id} franchiseCollections={franchiseCollections} />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForHGame}
          selectedId={f.series_id}
          inputText={f.series_text}
          onSelect={(id, label) => {
            u("series_id", id);
            u("series_text", label);
          }}
          onType={(t) => {
            u("series_text", t);
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

export default function HGameAddTab({
  franchiseCollections,
  hgf,
  uhg,
  allFranchises,
  allHGames,
  seriesItemsForHGame,
  sources,
  applyHGameAutofill,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <IgdbSearchBox onPick={applyHGameAutofill} searchUrl={endpoints.hGame.searchIgdb} />
      <SectionHeader icon="fa-gamepad" title="Titles & Naming" />
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
