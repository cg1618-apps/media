// Frontend: the dashboard's weekly schedule opens scrolled to today's column.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCHEDULE_DAYS } from "../../config/weekdays";
import WeeklySchedule from "./WeeklySchedule";

const COLUMN_WIDTH = 256;

// jsdom does no layout, so give each day column the offset a 256px-wide
// column would have; everything else keeps jsdom's 0.
let offsetLeft;
beforeEach(() => {
  offsetLeft = vi
    .spyOn(HTMLElement.prototype, "offsetLeft", "get")
    .mockImplementation(function () {
      const day = this.dataset?.day;
      return day ? SCHEDULE_DAYS.indexOf(day) * COLUMN_WIDTH : 0;
    });
  // Friday 2026-10-09 — late in the week, so today is off-screen unscrolled.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 9, 12, 0));
});
afterEach(() => {
  offsetLeft.mockRestore();
  vi.useRealTimers();
});

const items = [
  { system_id: "a1", _media_type: "anime", anime_name_en: "Frieren", my_watch_day: "Friday" },
];

function renderSchedule(props = {}) {
  render(
    <MemoryRouter>
      <WeeklySchedule
        id="schedule-watch"
        title="My watch schedule"
        dayField="my_watch_day"
        items={items}
        {...props}
      />
    </MemoryRouter>,
  );
  return screen.getByTestId("schedule-days");
}

describe("WeeklySchedule", () => {
  it("opens scrolled so today's column is the first one visible", () => {
    const strip = renderSchedule();
    expect(strip.scrollLeft).toBe(SCHEDULE_DAYS.indexOf("Friday") * COLUMN_WIDTH);
  });

  it("scrolls to today when a collapsed schedule is expanded", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WeeklySchedule
          id="schedule-broadcast"
          title="Broadcast schedule"
          dayField="my_watch_day"
          items={items}
          collapsible
          defaultCollapsed
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("schedule-days")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByTestId("schedule-days").scrollLeft).toBe(
      SCHEDULE_DAYS.indexOf("Friday") * COLUMN_WIDTH,
    );
  });
});
