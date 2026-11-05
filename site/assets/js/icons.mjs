// Shared with the build scripts through scripts/icons.mjs. Fixed set of simple line-art icons used on story/series cards and as
// Media Session artwork. Adapted from the V0 mockup's inline StoryIcon
// component. Each entry is a viewBox="0 0 120 82" two-path icon: `main`
// (the bold shape) and `detail` (thinner accent lines).
const ICONS = {
  sun: {
    main: "M18 59c15-20 24-35 42-35s27 15 42 35Z",
    detail: "M60 18v-8M40 23l-5-7M80 23l5-7M29 39h-9M91 39h9",
  },
  boat: {
    main: "M22 50h76c-4 12-14 18-26 18H48c-12 0-22-6-26-18ZM59 46V14l24 32ZM51 46V24L32 46Z",
    detail: "M55 8v42M14 77c8-4 16-4 24 0s16 4 24 0s16-4 24 0s16 4 20 0",
  },
  berry: {
    main: "M40 46a10 10 0 1 0 20 0a10 10 0 1 0-20 0ZM60 46a10 10 0 1 0 20 0a10 10 0 1 0-20 0ZM50 62a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z",
    detail: "M60 38V18M60 26c-4-8-14-10-22-6c4 8 14 10 22 6ZM60 26c4-8 14-10 22-6c-4 8-14 10-22 6Z",
  },
  shell: {
    main: "M33 61c0-28 16-42 28-42s28 14 28 42",
    detail: "M46 61c0-16 8-24 14-24s14 8 14 24",
  },
  cloud: {
    main: "M35 49c-5-13 12-24 23-14 9-18 36-8 30 9 14 0 16 17 3 21H34c-14-1-13-17 1-16Z",
    detail: "M40 56h40",
  },
  // Tradition emblems (docs/plans/2026-11-05-tradition-icons-design.md).
  greek: {
    main: "M38 18h44v8H38ZM44 26h32v32H44ZM38 58h44v8H38Z",
    detail: "M52 30v24M60 30v24M68 30v24",
  },
  norse: {
    main: "M34 16h52v20H34ZM54 36h12v34H54Z",
    detail: "M63 20l-8 8h10l-8 8",
  },
  hindu: {
    main: "M60 12c12 12 12 32 0 48c-12-16-12-36 0-48ZM60 62C44 60 30 50 26 34c14 2 26 10 34 28ZM60 62c16-2 30-12 34-28-14 2-26 10-34 28Z",
    detail: "M30 70h60",
  },
  egyptian: {
    main: "M16 40c14-18 74-18 88 0c-14 18-74 18-88 0ZM60 31a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z",
    detail: "M28 26c20-10 44-10 64 0M58 52l-4 14h12",
  },
  chinese: {
    main: "M60 22a18 18 0 1 0 0 36a18 18 0 1 0 0-36Z",
    detail: "M60 33a8 8 0 1 1-8 8c0-4 3-6 6-6M30 24c-5 8-3 18 3 24M90 24c5 8 3 18-3 24",
  },
  japanese: {
    main: "M14 20c14 5 78 5 92 0l-4 10H18ZM32 30h8v40h-8ZM80 30h8v40h-8Z",
    detail: "M30 44h60",
  },
  roman: {
    main: "M28 68V40a32 32 0 0 1 64 0v28H76V42a16 16 0 0 0-32 0v26Z",
    detail: "M60 8v10M18 68h84",
  },
  slavic: {
    main: "M36 30L60 14l24 16v16H36Z",
    detail: "M54 34h12v8H54ZM46 46v12l-8 10h-6M74 46v12l8 10h6",
  },
  mesoamerican: {
    main: "M60 12c22 16 22 40 0 58c-22-18-22-42 0-58Z",
    detail: "M60 20v54M60 36l-10-6M60 46l10-8M60 56l-10-8",
  },
  pacific: {
    main: "M60 10h10v34c0 16-14 24-28 18c-8-4-10-14-4-20l8 6c-4 4-2 8 4 10c8 2 10-4 10-12Z",
    detail: "M20 72c8-6 16-6 24 0s16 6 24 0s16-6 24 0",
  },
  "north-american": {
    main: "M48 14h24v54H48ZM48 26l-22-8v14l22 6ZM72 26l22-8v14l-22 6Z",
    detail: "M60 32l-5 8h10ZM54 22h2M64 22h2M48 48h24M48 58h24",
  },
  "west-african": {
    main: "M60 12l21 8l9 21l-9 21l-21 8l-21-8l-9-21l9-21Z",
    detail: "M60 12v58M30 41h60M39 20l42 42M81 20l-42 42M60 27l11 4l4 10l-4 10l-11 4l-11-4l-4-10l4-10Z",
  },
  andean: {
    main: "M52 12h16v10h10v10h12v18H78v10H68v10H52V60H42V50H30V32h12V22h10Z",
    detail: "M60 36a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z",
  },
  korean: {
    main: "M60 40c-12 0-20 8-20 16s6 10 20 10s20-2 20-10s-8-16-20-16ZM30 34a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM44 22a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM64 22a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM78 34a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z",
    detail: "M50 54c6 4 14 4 20 0",
  },
  persian: {
    main: "M60 14c4 0 6 4 6 8c0 3-1 5-2 7c14-2 28 2 40 14c-12-2-22-2-30 2c0 8-4 16-14 22c-10-6-14-14-14-22c-8-4-18-4-30-2c12-12 26-16 40-14c-1-2-2-4-2-7c0-4 2-8 6-8Z",
    detail: "M60 67v6M52 62l-4 8M68 62l4 8M80 38c6 2 12 5 16 9M40 38c-6 2-12 5-16 9",
  },
  finnish: {
    main: "M24 66V52L94 18v12L56 66Z",
    detail: "M36 48V66M48 42V66M60 36V62M72 30V51M84 25V40",
  },
  canaanite: {
    main: "M60 68c-12 0-18-8-18-16c-14 0-22-12-22-30c8 10 18 14 30 14h20c12 0 22-4 30-14c0 18-8 30-22 30c0 8-6 16-18 16Z",
    detail: "M62 38l-6 10h8l-5 12",
  },
  gathering: {
    main: "M28 26l16 3l-8 21ZM52 31h16l-8 25ZM76 29l16-3l-8 24Z",
    detail: "M14 20c28 16 64 16 92 0",
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
