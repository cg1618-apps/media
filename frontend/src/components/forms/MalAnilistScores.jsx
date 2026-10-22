// Frontend: the Scores section of the four types MAL and AniList both rate -
// anime, anime movie, manga and novel - shared by their Add and Modify bodies,
// so every figure the detail page shows can be edited on both pages.
//
// MAL Rank is free text because the column is a string ("#1234" as MAL prints
// it); the AniList figures are integers.
import { Field, SectionHeader, inputCls } from "./FormField";

function NumberField({ f, u, name, label, placeholder, ...attrs }) {
  return (
    <Field label={label}>
      <input
        className={inputCls}
        type="number"
        aria-label={label}
        value={f[name] ?? ""}
        onChange={(e) => u(name, e.target.value)}
        placeholder={placeholder}
        {...attrs}
      />
    </Field>
  );
}

export default function MalAnilistScores({ f, u }) {
  return (
    <>
      <SectionHeader icon="fa-star" title="Scores" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NumberField
          f={f}
          u={u}
          name="mal_rating"
          label="MAL Rating"
          placeholder="0.00"
          step="0.01"
          min="0"
          max="10"
        />
        <Field label="MAL Rank">
          <input
            className={inputCls}
            aria-label="MAL Rank"
            value={f.mal_rank ?? ""}
            onChange={(e) => u("mal_rank", e.target.value)}
            placeholder="#1234"
          />
        </Field>
        <NumberField
          f={f}
          u={u}
          name="anilist_rating"
          label="AniList Rating"
          placeholder="85"
          min="0"
          max="100"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumberField f={f} u={u} name="anilist_rank" label="AniList Rank" min="1" />
        <NumberField
          f={f}
          u={u}
          name="anilist_popularity_rank"
          label="AniList Popularity Rank"
          min="1"
        />
      </div>
    </>
  );
}
