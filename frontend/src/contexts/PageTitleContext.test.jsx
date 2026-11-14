// Frontend: the tab title - the route's, replaced by the page's own name.
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PageTitleProvider, usePageTitle } from "./PageTitleContext";

function Named({ name }) {
  usePageTitle(name);
  return <Link to="/seasonal">away</Link>;
}

function mount(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PageTitleProvider>
        <Routes>
          <Route path="/anime/:id" element={element} />
          <Route path="/seasonal" element={<p>seasonal</p>} />
        </Routes>
      </PageTitleProvider>
    </MemoryRouter>,
  );
}

describe("PageTitleProvider", () => {
  it("shows the route's title when the page names nothing", () => {
    mount("/seasonal", null);
    expect(document.title).toBe("Seasonal");
  });

  it("shows the page's own name in place of the route's", () => {
    mount("/anime/1", <Named name="進擊的巨人" />);
    expect(document.title).toBe("進擊的巨人");
  });

  it("falls back to the route's title while the page has no name yet", () => {
    mount("/anime/1", <Named name={null} />);
    expect(document.title).toBe("Anime");
  });

  it("drops the page's name when the page goes away", () => {
    mount("/anime/1", <Named name="進擊的巨人" />);
    fireEvent.click(screen.getByText("away"));
    expect(document.title).toBe("Seasonal");
  });
});

describe("usePageTitle", () => {
  it("does nothing outside a provider", () => {
    document.title = "untouched";
    render(
      <MemoryRouter>
        <Named name="ignored" />
      </MemoryRouter>,
    );
    expect(document.title).toBe("untouched");
  });
});
