// The read-only Business Logic page.
//
// Pins that the steps render in the order the data gives them, nested steps
// numbered under their parent, and that Calculate All's content follows
// run_calculate_all's call order.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import BusinessLogic from "./BusinessLogic";
import { BUSINESS_LOGIC_TOPICS } from "./businessLogicTopics";

function renderPage(props) {
  return render(
    <MemoryRouter>
      <BusinessLogic {...props} />
    </MemoryRouter>,
  );
}

describe("BusinessLogic", () => {
  it("renders each step of a topic, numbered, with its substeps", () => {
    const topics = [
      {
        key: "demo",
        title: "Demo",
        intro: ["What the demo does."],
        steps: [
          { title: "First", fn: "run_first", summary: "Does one thing." },
          {
            title: "Second",
            substeps: [
              {
                title: "Inner",
                groups: [{ title: "Half", points: ["A rule."] }],
              },
            ],
          },
        ],
      },
    ];
    renderPage({ topics });

    const topic = screen.getByTestId("topic-demo");
    expect(within(topic).getByText("What the demo does.")).toBeInTheDocument();
    expect(within(screen.getByTestId("step-1")).getByText("First")).toBeInTheDocument();
    expect(within(screen.getByTestId("step-1")).getByText("run_first")).toBeInTheDocument();
    expect(within(screen.getByTestId("step-2.1")).getByText("Inner")).toBeInTheDocument();
    expect(within(screen.getByTestId("step-2.1")).getByText("A rule.")).toBeInTheDocument();
  });

  it("documents Calculate All in run_calculate_all's order", () => {
    const calculate = BUSINESS_LOGIC_TOPICS.find((t) => t.key === "calculate-all");
    expect(calculate.steps.map((s) => s.fn)).toEqual([
      "run_post_processing",
      "run_derive_ep_previous",
      "run_seed_sequel_relations",
      "run_sync",
      "bulk_check_cover_image",
      "log_data_control",
    ]);
    // run_sync's own order, ending on the cast sync.
    const sync = calculate.steps.find((s) => s.fn === "run_sync");
    expect(sync.substeps.map((s) => s.fn)).toEqual([
      "run_sync_anime",
      "run_sync_anime_movie · run_sync_tv_show · run_sync_cartoon · run_sync_manga",
      "run_sync_novel",
      "run_sync_comic",
      "run_sync_h_comic",
      "run_sync_hentai",
      "run_sync_gated_labels",
      "run_sync_size_groups",
      "run_sync_cast",
    ]);
  });

  it("renders the real content, cast sync included", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Business Logic" })).toBeInTheDocument();
    expect(within(screen.getByTestId("step-4.9")).getByText("Sync cast and characters")).toBeInTheDocument();
    expect(screen.getByText("How the original seiyuu are chosen")).toBeInTheDocument();
    expect(within(screen.getByTestId("step-6")).getByText("Log the run")).toBeInTheDocument();
  });
});
