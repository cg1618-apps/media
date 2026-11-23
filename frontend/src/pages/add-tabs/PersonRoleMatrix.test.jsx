// The person form's role × scope matrix: a type ticked with no media type is
// held unscoped, a type the server does not offer is not drawn, and the club -
// a type that exists only for a gated type - keeps its scope.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { PersonRoleMatrix } from "./PersonAddTab";

const ILLUSTRATOR_ONLY = { illustrator: ["manga", "book", "comic"] };
const WITH_CLUB = { ...ILLUSTRATOR_ONLY, club: ["h-comic"] };

function Harness({ legalScopes, initial = [], onChange }) {
  const [roles, setRoles] = useState(initial);
  return (
    <PersonRoleMatrix
      roles={roles}
      legalScopes={legalScopes}
      setRoles={(next) => {
        setRoles(next);
        onChange(next);
      }}
    />
  );
}

function mount(legalScopes, initial) {
  const onChange = vi.fn();
  render(<Harness legalScopes={legalScopes} initial={initial} onChange={onChange} />);
  return onChange;
}

const last = (onChange) => onChange.mock.calls.at(-1)[0];

it("ticks a type with no media type selected", async () => {
  const onChange = mount(ILLUSTRATOR_ONLY);
  await userEvent.click(screen.getByRole("checkbox", { name: /Illustrator/ }));
  expect(last(onChange)).toEqual([{ role: "illustrator", scope: null }]);
  expect(screen.getByRole("button", { name: "manga" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("turns the unscoped row into scoped ones and back", async () => {
  const onChange = mount(ILLUSTRATOR_ONLY, [{ role: "illustrator", scope: null }]);
  await userEvent.click(screen.getByRole("button", { name: "book" }));
  expect(last(onChange)).toEqual([{ role: "illustrator", scope: "book" }]);
  await userEvent.click(screen.getByRole("button", { name: "book" }));
  expect(last(onChange)).toEqual([{ role: "illustrator", scope: null }]);
});

it("unticking the type drops every row of it", async () => {
  const onChange = mount(ILLUSTRATOR_ONLY, [{ role: "illustrator", scope: "manga" }]);
  await userEvent.click(screen.getByRole("checkbox", { name: /Illustrator/ }));
  expect(last(onChange)).toEqual([]);
});

it("does not draw a type the server does not offer", () => {
  mount(ILLUSTRATOR_ONLY);
  expect(screen.queryByRole("checkbox", { name: /Club/ })).not.toBeInTheDocument();
});

it("draws the club when offered, and ticking it selects its scope", async () => {
  const onChange = mount(WITH_CLUB);
  await userEvent.click(screen.getByRole("checkbox", { name: /Club/ }));
  expect(last(onChange)).toEqual([{ role: "club", scope: "h-comic" }]);
  // Its only scope cannot be unticked: an unscoped club would hide from nobody.
  expect(screen.getByRole("button", { name: "h-comic" })).toBeDisabled();
});
