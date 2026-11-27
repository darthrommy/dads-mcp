import { expect, test } from "vitest";
import { extractSpec } from "../src/spec.js";

const css = `/* .dads-ignored[data-ignored="x"] */
.dads-heading { color: red; }
.dads-heading[data-size="16"] .dads-heading__title, .dads-heading[data-size='4'] {}
.dads-heading[data-size="64"] {}
.dads-heading[data-size="18"] {}
.dads-heading[data-chip] .dads-heading__chip {}
.dads-heading:where([data-rule="2"]) {}
.dads-heading[aria-current="page"] {}
.dads-heading--wide { margin: .5rem; }
@media (min-width: 48em) { .dads-heading__sub { grid-template-areas: "a"; } }
.dads-u-visually-hidden {}
`;

test("extracts attributes and BEM classes from selectors", () => {
  expect(extractSpec([css])).toEqual({
    attributes: [
      { name: "data-chip", values: [] },
      { name: "data-rule", values: ["2"] },
      { name: "data-size", values: ["4", "16", "18", "64"] },
      { name: "aria-current", values: ["page"] },
    ],
    blocks: [{ block: "dads-heading", elements: ["chip", "sub", "title"], modifiers: ["wide"] }],
  });
});

test("merges several files", () => {
  const spec = extractSpec(['.dads-a[data-x="1"] {}', '.dads-a[data-x="2"] .dads-a__b {}']);
  expect(spec.attributes).toEqual([{ name: "data-x", values: ["1", "2"] }]);
  expect(spec.blocks).toEqual([{ block: "dads-a", elements: ["b"], modifiers: [] }]);
});
