import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useIncrementalList } from "./useIncrementalList";

// A fake IntersectionObserver: each observe() reports the target at once, as
// the real one does, with whatever `onScreen` says.
let onScreen;
let observers;

class FakeObserver {
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(target) {
    this.target = target;
    this.callback([{ target, isIntersecting: onScreen }]);
  }
  disconnect() {}
}

beforeEach(() => {
  onScreen = false;
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function List({ items, batch }) {
  const { visible, hasMore, sentinelRef } = useIncrementalList(items, batch);
  return (
    <>
      <ul>
        {visible.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {hasMore && <div ref={sentinelRef} data-testid="sentinel" />}
    </>
  );
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

function reachSentinel() {
  const last = observers[observers.length - 1];
  act(() => last.callback([{ target: last.target, isIntersecting: true }]));
}

it("draws one batch until the sentinel nears the screen", () => {
  render(<List items={range(25)} batch={10} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(10);

  reachSentinel();
  expect(screen.getAllByRole("listitem")).toHaveLength(20);

  reachSentinel();
  expect(screen.getAllByRole("listitem")).toHaveLength(25);
  expect(screen.queryByTestId("sentinel")).toBeNull();
});

it("keeps adding batches while the sentinel is still on screen", () => {
  // A batch too short to push the sentinel away must not stall the list.
  onScreen = true;
  render(<List items={range(25)} batch={10} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(25);
});

it("starts again from one batch when the list changes", () => {
  const { rerender } = render(<List items={range(25)} batch={10} />);
  reachSentinel();
  expect(screen.getAllByRole("listitem")).toHaveLength(20);

  rerender(<List items={range(25).reverse()} batch={10} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("24");
});

it("keeps its length when the page rebuilds the same list", () => {
  // A list rebuilt each render must not reset, or it never grows.
  const items = range(25);
  const { rerender } = render(<List items={items} batch={10} />);
  reachSentinel();
  rerender(<List items={[...items]} batch={10} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
});

it("draws everything when there is no IntersectionObserver", () => {
  vi.unstubAllGlobals();
  const original = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    render(<List items={range(25)} batch={10} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(screen.queryByTestId("sentinel")).toBeNull();
  } finally {
    if (original) globalThis.IntersectionObserver = original;
  }
});
