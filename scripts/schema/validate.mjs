// Machine-checked contracts. Every package's tests import these, so parallel
// work cannot drift from docs/contracts.md.
import fs from "node:fs";
import Ajv from "ajv";

const schemaPath = new URL("./library.schema.json", import.meta.url);
const ajv = new Ajv({ allErrors: true });
const validateLibrary = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));

// Returns { ok, errors: string[] }.
export function checkLibrary(value) {
  const ok = validateLibrary(value);
  return {
    ok,
    errors: ok ? [] : validateLibrary.errors.map((e) => `${e.instancePath || "/"} ${e.message}`),
  };
}

const V2_FIELDS = ["v", "audioTime", "scrollY", "playing", "savedAt", "completedAt"];

// Progress record v2: { v: 2, audioTime, scrollY, playing, savedAt, completedAt? }
export function checkProgressRecord(r) {
  if (!r || typeof r !== "object") return { ok: false, errors: ["not an object"] };
  const errors = [];
  const num = (k) => typeof r[k] === "number" && Number.isFinite(r[k]) && r[k] >= 0;
  if (r.v !== 2) errors.push("v must be 2");
  if (!num("audioTime")) errors.push("audioTime must be a non-negative number");
  if (!num("scrollY")) errors.push("scrollY must be a non-negative number");
  if (typeof r.playing !== "boolean") errors.push("playing must be a boolean");
  if (!num("savedAt")) errors.push("savedAt must be a non-negative number");
  if ("completedAt" in r && !num("completedAt")) errors.push("completedAt must be a non-negative number");
  for (const k of Object.keys(r)) {
    if (!V2_FIELDS.includes(k)) errors.push(`unexpected field ${k} (v2 stores no url/title/artwork)`);
  }
  return { ok: errors.length === 0, errors };
}
