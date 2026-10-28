// LazyImage holds an image's src back until it has stayed near the screen for
// DWELL_MS, and takes it away if the image leaves while still loading. jsdom
// has no IntersectionObserver, so each test installs a fake one and fires its
// records by hand.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LazyImage, { DWELL_MS } from "./LazyImage";

const SRC = "/api/covers/anime/1.jpg";

// The callback each observed element was registered with.
let callbacks;

class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(el) {
    callbacks.set(el, this.callback);
  }
  disconnect() {}
  unobserve() {}
}

function fire(img, isIntersecting) {
  act(() => callbacks.get(img)([{ target: img, isIntersecting }]));
}

function setComplete(img, complete) {
  Object.defineProperty(img, "complete", { value: complete, configurable: true });
}

function renderImage() {
  render(<LazyImage src={SRC} alt="Cover" />);
  return screen.getByAltText("Cover");
}

describe("with an IntersectionObserver", () => {
  beforeEach(() => {
    callbacks = new Map();
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads at once when it is on screen at mount", () => {
    const img = renderImage();
    expect(img.getAttribute("src")).toBeNull();
    fire(img, true);
    expect(img.getAttribute("src")).toBe(SRC);
  });

  it("waits DWELL_MS before loading once scrolled into view", () => {
    const img = renderImage();
    fire(img, false);
    fire(img, true);
    act(() => vi.advanceTimersByTime(DWELL_MS - 1));
    expect(img.getAttribute("src")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(img.getAttribute("src")).toBe(SRC);
  });

  it("never loads when it leaves before the dwell is up", () => {
    const img = renderImage();
    fire(img, false);
    fire(img, true);
    act(() => vi.advanceTimersByTime(DWELL_MS / 2));
    fire(img, false);
    act(() => vi.advanceTimersByTime(DWELL_MS * 4));
    expect(img.getAttribute("src")).toBeNull();
  });

  it("drops the src when it leaves while still loading", () => {
    const img = renderImage();
    fire(img, true);
    expect(img.getAttribute("src")).toBe(SRC);
    setComplete(img, false);
    fire(img, false);
    expect(img.getAttribute("src")).toBeNull();
  });

  it("keeps the src when it leaves after it finished loading", () => {
    const img = renderImage();
    fire(img, true);
    setComplete(img, true);
    fire(img, false);
    expect(img.getAttribute("src")).toBe(SRC);
  });
});

describe("without an IntersectionObserver", () => {
  it("sets the src at once", () => {
    expect(typeof IntersectionObserver).toBe("undefined");
    const img = renderImage();
    expect(img.getAttribute("src")).toBe(SRC);
    expect(img.getAttribute("loading")).toBe("lazy");
  });
});
