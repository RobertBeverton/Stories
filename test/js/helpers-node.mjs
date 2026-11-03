// Fixture loaders that need no DOM (usable from node-environment tests).
import fs from "node:fs";
import path from "node:path";

const fixture = (name) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "test/fixtures", name), "utf8"));

export const progressV1 = fixture("progress-v1.json");
export const progressV2 = fixture("progress-v2.json");
export const library = fixture("library.json");
