import { describe, expect, it } from "vitest";
import { buildImportMap } from "../../scripts/page-security.mjs";

describe("import map escaping", () => {
  const hostile = "</script><img src=x onerror=alert(1)>";

  it("escapes a hostile build id so it cannot close the script tag, and still parses back to it", () => {
    const { json } = buildImportMap(hostile);
    expect(json).not.toContain("<");
    expect(json).not.toContain("</script");
    const parsed = JSON.parse(json);
    expect(Object.values(parsed.imports).every((v) => v.endsWith(`?v=${hostile}`))).toBe(true);
  });
});
