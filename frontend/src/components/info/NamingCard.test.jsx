// Frontend: the Naming card lists only the names an entry actually has.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NamingCard from "./NamingCard";

describe("NamingCard", () => {
  it("shows each name that is set, and no row for one that is not", () => {
    render(
      <NamingCard
        type="anime"
        item={{
          anime_name_cn: "進擊的巨人",
          anime_name_en: "Attack on Titan",
          anime_name_roman: null,
          anime_name_jp: "",
          anime_name_alt: "   ",
        }}
      />,
    );
    expect(screen.getByText("Chinese")).toBeInTheDocument();
    expect(screen.getByText("Attack on Titan")).toBeInTheDocument();
    expect(screen.queryByText("Roman")).not.toBeInTheDocument();
    expect(screen.queryByText("Japanese")).not.toBeInTheDocument();
    expect(screen.queryByText("Alternative")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders nothing when no name is set", () => {
    const { container } = render(
      <NamingCard type="anime" item={{ anime_name_en: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
