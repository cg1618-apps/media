// MyTrackerCard's "Paused at" field, and the PausedAtInput it renders; the
// card's own controls and its self.list gate (`canTrack`).
//
// Saved on blur (and Enter), only when the text changed, a blank as null.
// The server clears the position when ep_fin goes up or the entry becomes
// Completed, so the input must also show a value that changed under it.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MyTrackerCard, { PausedAtInput } from "./MyTrackerCard";

const mockAuth = vi.hoisted(() => ({ username: "member" }));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

function card(props = {}) {
  return (
    <MyTrackerCard
      epFin={3}
      epTotal={12}
      watchingStatus="Active Watching"
      myRating=""
      canTrack
      onEpChange={() => {}}
      onStatusChange={() => {}}
      onRatingChange={() => {}}
      statusOptions={["Active Watching"]}
      ratingOptions={["S"]}
      {...props}
    />
  );
}

describe("PausedAtInput", () => {
  beforeEach(() => {
    mockAuth.username = "member";
  });

  it("saves the trimmed text on blur", () => {
    const onChange = vi.fn();
    render(<PausedAtInput value={null} canTrack onChange={onChange} />);
    const input = screen.getByLabelText("Paused at");
    fireEvent.change(input, { target: { value: "  14:35 " } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("14:35");
  });

  it("saves on Enter", () => {
    const onChange = vi.fn();
    render(<PausedAtInput value={null} canTrack onChange={onChange} />);
    const input = screen.getByLabelText("Paused at");
    input.focus();
    fireEvent.change(input, { target: { value: "1:10:00" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("1:10:00");
  });

  it("writes nothing when the text did not change", () => {
    const onChange = vi.fn();
    render(<PausedAtInput value="14:35" canTrack onChange={onChange} />);
    fireEvent.blur(screen.getByLabelText("Paused at"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears to null", () => {
    const onChange = vi.fn();
    render(<PausedAtInput value="14:35" canTrack onChange={onChange} />);
    const input = screen.getByLabelText("Paused at");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows a position the server cleared", () => {
    const { rerender } = render(
      <PausedAtInput value="14:35" canTrack onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Paused at")).toHaveValue("14:35");
    rerender(<PausedAtInput value={null} canTrack onChange={() => {}} />);
    expect(screen.getByLabelText("Paused at")).toHaveValue("");
  });

  it("is absent for a viewer without self.list", () => {
    const { container } = render(
      <PausedAtInput value="14:35" canTrack={false} onChange={() => {}} />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MyTrackerCard's Paused at field", () => {
  beforeEach(() => {
    mockAuth.username = "member";
  });

  it("renders when the page passes a handler, and writes through it", () => {
    const onTimeFinChange = vi.fn();
    render(card({ timeFin: "14:35", onTimeFinChange }));
    const input = screen.getByLabelText("Paused at");
    expect(input).toHaveValue("14:35");
    fireEvent.change(input, { target: { value: "20:00" } });
    fireEvent.blur(input);
    expect(onTimeFinChange).toHaveBeenCalledWith("20:00");
  });

  it("is absent for a type that passes none", () => {
    render(card());
    expect(screen.queryByLabelText("Paused at")).toBeNull();
  });
});

describe("MyTrackerCard's controls", () => {
  beforeEach(() => {
    mockAuth.username = "member";
  });

  it("are enabled for a holder of self.list, and write through the handlers", async () => {
    const onStatusChange = vi.fn();
    const onWatchNextChange = vi.fn();
    const onToRewatchChange = vi.fn();
    render(
      card({
        statusOptions: ["Active Watching", "Completed"],
        onStatusChange,
        watchNext: false,
        onWatchNextChange,
        toRewatch: true,
        onToRewatchChange,
      }),
    );
    const status = screen.getByRole("combobox", { name: "Watching status" });
    expect(status).toBeEnabled();
    fireEvent.change(status, { target: { value: "Completed" } });
    expect(onStatusChange).toHaveBeenCalledWith("Completed");

    fireEvent.click(screen.getByRole("checkbox", { name: "Watch next" }));
    expect(onWatchNextChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "To rewatch" }));
    expect(onToRewatchChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Next episode" })).toBeEnabled();
  });

  it("are absent - the whole card - without self.list", () => {
    const { container } = render(
      card({ canTrack: false, onWatchNextChange: () => {}, onTimeFinChange: () => {} }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
