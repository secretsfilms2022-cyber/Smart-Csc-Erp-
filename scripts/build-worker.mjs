import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const parts = readdirSync(dir)
  .filter((name) => /^worker\.part\d+\.js$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!parts.length) throw new Error("No worker source parts found");

// The repository previously accumulated multiple rounds of UTF-8 -> Latin-1
// mojibake. Repair source text BEFORE JavaScript is deployed so literals,
// HTML, APP_JS and API error messages are genuinely Unicode again.
function repairUtf8Mojibake(value) {
  let out = String(value ?? "");
  for (let pass = 0; pass < 12; pass++) {
    if (!/[ÃÂâ]/.test(out)) break;
    try {
      const bytes = new Uint8Array(out.length);
      let valid = true;
      for (let i = 0; i < out.length; i++) {
        const code = out.charCodeAt(i);
        if (code > 255) { valid = false; break; }
        bytes[i] = code;
      }
      if (!valid) break;
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === out) break;
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

const source = parts
  .map((name) => repairUtf8Mojibake(readFileSync(join(dir, name), "utf8")))
  .join("");

// Runtime repair remains as a safety net for dynamically generated/legacy
// strings, but the deployed source itself must already be clean.
const bootstrap = `
function repairUtf8Mojibake(value){
  let out=String(value==null?"":value);
  for(let pass=0;pass<12;pass++){
    if(!/[ÃÂâ]/.test(out)) break;
    try{
      const bytes=new Uint8Array(out.length);
      let valid=true;
      for(let i=0;i<out.length;i++){
        const code=out.charCodeAt(i);
        if(code>255){valid=false;break}
        bytes[i]=code;
      }
      if(!valid) break;
      const decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      if(decoded===out) break;
      out=decoded;
    }catch(e){break}
  }
  return out;
}
`;

const built = bootstrap + source;
if (/[ÃÂ]{2,}/.test(built)) {
  throw new Error("Build still contains UTF-8 mojibake markers");
}
writeFileSync("dist-worker.js", built, "utf8");
console.log("Built", parts.length, "parts with source-level UTF-8 repair,", built.length, "bytes");
