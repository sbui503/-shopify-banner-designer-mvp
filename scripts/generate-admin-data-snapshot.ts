import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLiveAdminData } from "../lib/admin-data";

const outputFile = path.join(process.cwd(), "data", "admin-data-snapshot.json");
const data = await getLiveAdminData();

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(data)}\n`, "utf8");

console.log(`Synced ${data.system.productCount} products, ${data.system.assetCount} assets, and ${data.system.templateCount} templates from the customer tool.`);
