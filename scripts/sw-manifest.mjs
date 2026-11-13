// The list of files the service worker caches when it installs (the app shell).
// URLs are exactly what the pages ask for: css and modules carry ?v=<buildId>,
// the worker's own modules are plain (a module worker imports them unversioned).
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const WORKER_MODULES = new Set(["sw-logic.mjs", "offline-core.mjs"]);

export function precacheList({ buildId, prefix, origin = "", root = process.cwd() }) {
  const at = (p) => `${origin}${prefix}${p}`;
  const v = `?v=${buildId}`;
  const list = [at("/"), at("/library/")];
  // The Offline page is only listed once its template exists (Task 11); a listed
  // page that 404s would make every worker install fail.
  if (fs.existsSync(path.join(root, "site/offline.njk"))) list.push(at("/offline/"));
  list.push(at(`/library.json${v}`), at("/manifest.webmanifest"));
  const under = (pattern) => fg.sync(pattern, { cwd: path.join(root, "site/assets"), ignore: ["**/*.test.mjs"] }).sort();
  for (const f of under("css/*.css")) list.push(at(`/assets/css/${f.replace(/^css\//, "")}${v}`));
  for (const f of under("js/*.{js,mjs}")) {
    const name = f.replace(/^js\//, "");
    list.push(at(`/assets/js/${name}${WORKER_MODULES.has(name) ? "" : v}`));
  }
  for (const name of ["app-icon-192.png", "app-icon-512.png"]) {
    if (fs.existsSync(path.join(root, "site/assets", name))) list.push(at(`/assets/${name}`));
  }
  return list;
}
