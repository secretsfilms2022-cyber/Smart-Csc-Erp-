import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const parts = readdirSync(dir)
  .filter((name) => /^worker\.part\d+\.js$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
if (!parts.length) throw new Error("No worker source parts found");
const source = parts.map((name) => readFileSync(join(dir,name),"utf8")).join("");
writeFileSync("dist-worker.js", source, "utf8");
console.log("Built", parts.length, "parts,", source.length, "bytes");
