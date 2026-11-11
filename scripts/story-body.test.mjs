import { describe, expect, it } from "vitest";
import { dropTitleHeading } from "./story-body.mjs";

describe("dropTitleHeading", () => {
  it("drops a leading h1 that repeats the title", () => {
    expect(dropTitleHeading("<h1>The Big Kids Club</h1>\n<p>Once.</p>", "The Big Kids Club")).toBe("<p>Once.</p>");
  });

  it("matches case, spacing, entities and inline markup", () => {
    expect(dropTitleHeading('<h1 id="x"> Tom &amp; <em>Jerry</em>  </h1><p>a</p>', "tom & jerry")).toBe("<p>a</p>");
    expect(dropTitleHeading("<h1>Alex&#39;s Day</h1><p>a</p>", "Alex's Day")).toBe("<p>a</p>");
  });

  it("turns an h1 that is not the title into an h2, and later h1s too", () => {
    expect(dropTitleHeading("<h1>Another Name</h1><p>a</p>", "The Title")).toBe("<h2>Another Name</h2><p>a</p>");
    expect(dropTitleHeading("<p>a</p><h1>Late</h1>", "The Title")).toBe("<p>a</p><h2>Late</h2>");
  });

  it("leaves other headings and non-string input alone", () => {
    expect(dropTitleHeading("<h2>Part One</h2><p>a</p>", "T")).toBe("<h2>Part One</h2><p>a</p>");
    expect(dropTitleHeading(undefined, "T")).toBeUndefined();
  });
});
