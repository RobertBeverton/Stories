// What the Library remembers. Every read and write is guarded: storage can be
// blocked (private windows) and the page must work without it.
//
// - sessionStorage `stories-library-view`: chips, tradition, which series are
//   open, how many stories each has revealed. Per tab, so a Back from a story
//   finds the Library as it was left, and a new visit starts calm.
// - sessionStorage `stories-library-query`: the typed search.
// - localStorage `stories-library-sort`: "order" (default), "newest" or "plays", a
//   preference that stays.
const VIEW = "stories-library-view";
const QUERY = "stories-library-query";
const SORT = "stories-library-sort";
export const SORTS = ["order", "newest", "plays"];

const isCount = (n) => Number.isInteger(n) && n >= 1 && n <= 1000;

function counts(value) {
  const out = {};
  if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (isCount(v)) out[k] = v;
  return out;
}

/** @returns {{audio: boolean, saved: boolean, statuses: string[], collection: string, open: Record<string, boolean>, pages: Record<string, number>, flatPages: number, groupPages: number}} */
export function readView() {
  let raw = {};
  try {
    raw = JSON.parse(sessionStorage.getItem(VIEW) ?? "{}") ?? {};
  } catch {
    raw = {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const open = {};
  if (raw.open && typeof raw.open === "object") for (const [k, v] of Object.entries(raw.open)) if (typeof v === "boolean") open[k] = v;
  return {
    audio: raw.audio === true,
    saved: raw.saved === true,
    statuses: Array.isArray(raw.statuses) ? raw.statuses.filter((s) => typeof s === "string") : [],
    collection: typeof raw.collection === "string" ? raw.collection : "",
    open,
    pages: counts(raw.pages),
    flatPages: isCount(raw.flatPages) ? raw.flatPages : 1,
    groupPages: isCount(raw.groupPages) ? raw.groupPages : 1,
  };
}

export function writeView(view) {
  try {
    sessionStorage.setItem(VIEW, JSON.stringify(view));
  } catch {
    // not remembered
  }
}

export function readQuery() {
  try {
    return sessionStorage.getItem(QUERY) ?? "";
  } catch {
    return "";
  }
}

export function writeQuery(query) {
  try {
    if (query) sessionStorage.setItem(QUERY, query);
    else sessionStorage.removeItem(QUERY);
  } catch {
    // not remembered
  }
}

export function getSort() {
  try {
    const value = localStorage.getItem(SORT);
    return SORTS.includes(value) ? value : "order";
  } catch {
    return "order";
  }
}

export function setSort(sort) {
  try {
    localStorage.setItem(SORT, sort);
  } catch {
    // not remembered
  }
}
