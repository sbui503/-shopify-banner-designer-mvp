import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbiddenPreviewData = [
  "Duy Nguyen",
  "Doan Tran",
  "Baseball Booster Club",
  "Irvine Track",
  "Angels Volleyball",
  "#TSB-1048",
  "Preview order rows."
];
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx", ".json"]);

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory()
      ? sourceFiles(file)
      : sourceExtensions.has(path.extname(file)) ? [file] : [];
  });
}

const hits = ["app", "components", "lib"]
  .flatMap((directory) => sourceFiles(path.join(root, directory)))
  .flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return forbiddenPreviewData
      .filter((value) => source.includes(value))
      .map((value) => `${path.relative(root, file)}: ${value}`);
  });

const snapshot = JSON.parse(readFileSync(path.join(root, "data/admin-data-snapshot.json"), "utf8"));
if (Array.isArray(snapshot.orders) && snapshot.orders.length) {
  hits.push(`data/admin-data-snapshot.json: ${snapshot.orders.length} non-live order rows`);
}

if (hits.length) {
  console.error("Production admin contains prohibited preview customer data:\n" + hits.join("\n"));
  process.exit(1);
}

console.log("Production data guard passed: no preview customer rows.");
