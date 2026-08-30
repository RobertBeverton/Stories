import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { iconSvgPath, iconDetailSvgPath } from "./icons.mjs";

export function buildIconSvg({ icon, background }) {
  const main = iconSvgPath(icon); // throws on invalid icon, same as validate-content's check
  const detail = iconDetailSvgPath(icon);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 82" width="512" height="512">
    <rect width="120" height="82" fill="${background}" />
    <path d="${main}" fill="none" stroke="#ffffff" stroke-width="4" />
    <path d="${detail}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.85" />
  </svg>`;
}

export function iconArtCombosFor(stories) {
  const seen = new Map();
  for (const s of stories) {
    const key = `${s.icon}__${s.accentColorBackground}`;
    if (!seen.has(key)) seen.set(key, { icon: s.icon, background: s.accentColorBackground });
  }
  return Array.from(seen.values());
}

function comboFilename({ icon, background }) {
  return `${icon}-${background.replace("#", "")}`;
}

export async function generateAll(combos, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const combo of combos) {
    const svg = buildIconSvg(combo);
    const base = comboFilename(combo);
    for (const size of [192, 512]) {
      const outPath = path.join(outDir, `${base}-${size}.png`);
      await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
      written.push(outPath);
    }
  }
  return written;
}

import { pathToFileURL } from "node:url";
import { loadStories, computeStories } from "./stories-lib.mjs";
import { accentColorFor } from "./accent-colors.mjs";

async function main() {
  const raw = await loadStories();
  const stories = computeStories(raw).map((s) => ({
    icon: s.icon,
    accentColorBackground: accentColorFor(s.series).background,
  }));
  const combos = iconArtCombosFor(stories);
  const outDir = "site/assets/generated/icons";
  const written = await generateAll(combos, outDir);
  console.log(`Generated ${written.length} icon PNGs from ${combos.length} icon/color combos into ${outDir}`);

  // buildIconSvg's root <svg> declares width="512" height="512" (matching its
  // intended Media Session artwork usage), which makes sharp/librsvg rasterize
  // it at a stretched 512x512 *before* any resize runs — so a plain
  // resize(size, size, { fit: "cover" }) is a no-op crop on an image that's
  // already been squashed to square, and the viewBox's true 120:82 aspect
  // (with transparent padding outside the 120x82 <rect>) never gets a chance
  // to be cropped-to-fill. Strip the explicit width/height so sharp rasterizes
  // at the SVG's natural 120x82 viewBox aspect ratio first; only then does
  // fit: "cover" correctly scale-and-crop that rect to fill the square canvas
  // with solid background color edge-to-edge.
  const appIconSvg = buildIconSvg({ icon: "sun", background: "#e8735c" }).replace(
    /<svg xmlns="[^"]*" viewBox="([^"]*)" width="[^"]*" height="[^"]*">/,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="$1">'
  );
  for (const size of [192, 512]) {
    await sharp(Buffer.from(appIconSvg))
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(`site/assets/app-icon-${size}.png`);
  }
  console.log("Generated app icons: site/assets/app-icon-192.png, site/assets/app-icon-512.png");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
