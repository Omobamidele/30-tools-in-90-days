// Downloads the curated Unsplash photos listed in scripts/imagery-manifest.json into
// public/images/{wallpapers,covers}/<key>.webp, sized for their use. Re-runnable; skips files
// that already exist. Usage: node scripts/fetch-imagery.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) exposure-register-imagery/1.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = JSON.parse(readFileSync(new URL("./imagery-manifest.json", import.meta.url), "utf8"));
const sets = [
  { name: "wallpapers", items: manifest.wallpapers, width: 2400, quality: 60 },
  { name: "covers", items: manifest.covers, width: 1400, quality: 75 },
];

for (const set of sets) {
  const dir = `public/images/${set.name}`;
  mkdirSync(dir, { recursive: true });
  for (const item of set.items) {
    const out = `${dir}/${item.key}.webp`;
    if (existsSync(out)) {
      console.log(`skip  ${out}`);
      continue;
    }
    // The download endpoint redirects to the CDN original; the CDN resizes on request.
    // Paced and retried: the endpoint rate-limits bursts (HTTP 429).
    let location = null;
    for (let attempt = 1; attempt <= 5 && !location; attempt++) {
      const redirect = await fetch(`https://unsplash.com/photos/${item.id}/download`, { redirect: "manual", headers });
      location = redirect.headers.get("location");
      if (!location) {
        if (redirect.status !== 429) throw new Error(`No redirect for ${item.key} (${item.id}): HTTP ${redirect.status}`);
        await sleep(attempt * 8000);
      }
    }
    if (!location) throw new Error(`Still rate-limited for ${item.key}; run again later (existing files are skipped)`);
    await sleep(2500);
    const url = new URL(location);
    url.searchParams.set("w", String(set.width));
    url.searchParams.set("q", String(set.quality));
    url.searchParams.set("fm", "webp");
    url.searchParams.set("fit", "max");
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed for ${item.key}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(out, bytes);
    console.log(`saved ${out}  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
}
