import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../dist/", import.meta.url);
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== "sw.js") files.push(path);
  }
}
await walk(root.pathname);
files.sort();
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(file));
const version = hash.digest("hex").slice(0,16);
const urls = files.map((file) => "/" + relative(root.pathname, file).replaceAll("\\", "/"));
const source = await readFile(new URL("./sw-template.js", import.meta.url), "utf8");
await writeFile(new URL("sw.js", root), source.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(urls)));
console.log(`Service worker ${version}: ${urls.length} static files cached; API requests excluded.`);
