// Fixed set of simple line-art icons used on story/series cards and as
// Media Session artwork. Adapted from the V0 mockup's inline StoryIcon
// component. Each entry is a viewBox="0 0 120 82" two-path icon: `main`
// (the bold shape) and `detail` (thinner accent lines).
const ICONS = {
  sun: {
    main: "M18 59c15-20 24-35 42-35s27 15 42 35Z",
    detail: "M60 18v-8M40 23l-5-7M80 23l5-7M29 39h-9M91 39h9",
  },
  boat: {
    main: "M25 55h70l-10 14H37Z",
    detail: "M60 55V20l18 16Z",
  },
  berry: {
    main: "M48 52c3-19 9-29 12-29s9 10 12 29",
    detail: "M60 23c0-6 4-10 4-10",
  },
  shell: {
    main: "M33 61c0-28 16-42 28-42s28 14 28 42",
    detail: "M46 61c0-16 8-24 14-24s14 8 14 24",
  },
  cloud: {
    main: "M35 49c-5-13 12-24 23-14 9-18 36-8 30 9 14 0 16 17 3 21H34c-14-1-13-17 1-16Z",
    detail: "M40 56h40",
  },
};

export const ICON_NAMES = Object.keys(ICONS);

export function isValidIcon(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(ICONS, name);
}

function requireIcon(name) {
  if (!isValidIcon(name)) {
    throw new Error(`Unknown icon name: ${name}. Valid names: ${ICON_NAMES.join(", ")}`);
  }
  return ICONS[name];
}

export function iconSvgPath(name) {
  return requireIcon(name).main;
}

export function iconDetailSvgPath(name) {
  return requireIcon(name).detail;
}
