// Frontend: read-only account of what the pipelines do to the data.
//
// The question it answers is the one the Control Center's buttons raise and do
// not explain: I pressed Calculate All, so what did it change? One slip per
// topic, one numbered row per step, in the order the code runs them. The
// content is data (businessLogicTopics.js); this file only lays it out, so a new
// topic is an entry in that array.
//
// Gated on manage.pipelines (super by grant, admin by the root flag), in
// App.jsx's route and in navigation.js's row - the two permission surfaces.
import { Link } from "react-router-dom";

import { Eyebrow, Slip } from "../../components/ui/primitives";
import { BUSINESS_LOGIC_TOPICS } from "./businessLogicTopics";

function PointList({ points }) {
  return (
    <ul className="mt-2 space-y-1 list-disc pl-5 text-sm text-text-muted marker:text-text-faint">
      {points.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ul>
  );
}

function Step({ step, number }) {
  return (
    <li data-testid={`step-${number}`} className="flex gap-4">
      <span className="font-mono text-xs text-text-faint pt-0.5 w-8 shrink-0 text-right">
        {number}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-bold text-text">{step.title}</h3>
          {step.fn && <Eyebrow as="span" className="break-all">{step.fn}</Eyebrow>}
        </div>
        {step.summary && (
          <p className="mt-1 text-sm text-text-muted max-w-3xl">{step.summary}</p>
        )}
        {step.points && <PointList points={step.points} />}
        {step.groups?.map((group) => (
          <div key={group.title} className="mt-3 max-w-3xl">
            <div className="flex items-baseline gap-3">
              <Eyebrow as="h4" className="text-text-muted">
                {group.title}
              </Eyebrow>
              <span className="flex-1 border-t border-dotted border-border-strong/60" />
            </div>
            <PointList points={group.points} />
          </div>
        ))}
        {step.substeps && (
          <ol className="mt-4 space-y-5 border-l border-border pl-2">
            {step.substeps.map((sub, i) => (
              <Step key={sub.title} step={sub} number={`${number}.${i + 1}`} />
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

function Topic({ topic }) {
  return (
    <section id={topic.key} data-testid={`topic-${topic.key}`} className="mb-8 scroll-mt-28">
      <Slip title={topic.title}>
        <div className="space-y-2 text-sm text-text-muted max-w-3xl mb-6">
          {topic.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <ol className="space-y-6">
          {topic.steps.map((step, i) => (
            <Step key={step.title} step={step} number={String(i + 1)} />
          ))}
        </ol>
      </Slip>
    </section>
  );
}

export default function BusinessLogic({ topics = BUSINESS_LOGIC_TOPICS }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black text-text">
          Business Logic
        </h1>
        <p className="text-sm text-text-faint mt-1">
          What the pipelines change in the data, step by step, in the order
          they run. Read-only — the actions themselves are on the{" "}
          <Link to="/system" className="font-bold text-brand hover:text-brand-hover">
            Control Center
          </Link>
          .
        </p>
      </header>

      {topics.map((topic) => (
        <Topic key={topic.key} topic={topic} />
      ))}
    </div>
  );
}
