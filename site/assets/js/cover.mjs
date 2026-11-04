// Builds the same cover tile the templates emit (site/_includes/cover.njk) for
// cards the modules render: the story's series colours and its line icon.
// Colours and icon come from the shared palette and icon set, so a card looks
// like the story's own page.
import { accentColorFor } from "./accent-colors.mjs";
import { h } from "./dom.mjs";
import { iconDetailSvgPath, iconSvgPath, isValidIcon } from "./icons.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgPath(d, className) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  return path;
}

/** The line icon as an <svg> (main and detail strokes), or null for an unknown name. */
export function iconSvg(name) {
  if (!isValidIcon(name)) return null;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 82");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.append(svgPath(iconSvgPath(name), "icon-main"), svgPath(iconDetailSvgPath(name), "icon-detail"));
  return svg;
}

/** @param {{icon: string, series: string|null}} story @param {string} [extraClass] */
export function cover(story, extraClass = "") {
  const { background, text } = accentColorFor(story.series ?? undefined);
  return h(
    "div",
    {
      class: `cover ${extraClass}`.trim(),
      style: `--series: ${background}; --series-ink: ${text};`,
      "aria-hidden": "true",
      "data-icon": story.icon,
    },
    iconSvg(story.icon),
  );
}
