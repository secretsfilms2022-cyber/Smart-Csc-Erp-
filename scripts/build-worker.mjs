import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const parts = readdirSync(dir)
  .filter((name) => /^worker\.part\d+\.js$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!parts.length) throw new Error("No worker source parts found");

function repairSegment(segment) {
  let out = segment;
  for (let pass = 0; pass < 12; pass++) {
    if (!/[\u00C3\u00C2\u00E2]/.test(out)) break;
    try {
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === out) break;
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

// Repair only Latin-1-sized runs so already-correct Hindi/emoji/Unicode in the
// source cannot prevent the legacy mojibake portions from being decoded.
function repairUtf8Mojibake(value) {
  return String(value ?? "").replace(/[\u0000-\u00FF]+/g, segment =>
    /[\u00C3\u00C2\u00E2]/.test(segment) ? repairSegment(segment) : segment
  );
}

const source = parts
  .map((name) => repairUtf8Mojibake(readFileSync(join(dir, name), "utf8")))
  .join("");

const bootstrap = `
function repairUtf8Mojibake(value){
  function repairSegment(segment){
    var out=segment;
    for(var pass=0;pass<12;pass++){
      if(!/[\\u00C3\\u00C2\\u00E2]/.test(out)) break;
      try{
        var bytes=new Uint8Array(out.length);
        for(var i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i);
        var decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
        if(decoded===out)break;
        out=decoded;
      }catch(e){break}
    }
    return out;
  }
  return String(value==null?"":value).replace(/[\\u0000-\\u00FF]+/g,function(segment){
    return /[\\u00C3\\u00C2\\u00E2]/.test(segment)?repairSegment(segment):segment;
  });
}
`;

const built = bootstrap + source;
const residual = (built.match(/[\u00C3\u00C2\u00E2]/g) || []).length;
console.log("UTF-8 repair residual marker count:", residual);
if (residual) throw new Error("Build still contains UTF-8 mojibake markers");
writeFileSync("dist-worker.js", built, "utf8");
console.log("Built", parts.length, "parts with segment-level UTF-8 repair,", built.length, "bytes");
