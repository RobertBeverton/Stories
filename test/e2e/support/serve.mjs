// Builds the fixture site and serves it at http://127.0.0.1:<port>/Stories/ the
// way GitHub Pages would (directory index.html, the /Stories prefix, no custom
// headers). Used by playwright.config.mjs as its webServer. Stops and cleans
// up on SIGINT or SIGTERM.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { buildFixtureSite, removeFixtureSite } from "./build-fixture-site.mjs";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const PREFIX = "/Stories";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain", ".mp3": "audio/mpeg",
};

const site = buildFixtureSite({ log: (m) => console.log(`[e2e] ${m}`) });

function resolveFile(urlPath) {
  const relative = decodeURIComponent(urlPath).slice(PREFIX.length);
  const target = path.join(site, relative);
  if (!target.startsWith(site)) return null; // path traversal
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) return path.join(target, "index.html");
  return target;
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === PREFIX) {
    res.writeHead(301, { Location: `${PREFIX}/` }).end();
    return;
  }
  const file = pathname.startsWith(`${PREFIX}/`) ? resolveFile(pathname) : null;
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => console.log(`[e2e] serving ${site} at http://127.0.0.1:${PORT}${PREFIX}/`));

function stop() {
  server.close();
  removeFixtureSite(site);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
