import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const parts = readdirSync(dir)
  .filter((name) => /^worker\.part\d+\.js$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!parts.length) throw new Error("No worker source parts found");

// Keep the original worker source byte-for-byte intact. The legacy source
// contains deeply corrupted UI literals, so repairing source text before JS
// parsing can accidentally alter JavaScript syntax. Instead the runtime helper
// repairs only response/app strings after the worker has parsed successfully.
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

const source = parts.map((name) => readFileSync(join(dir,name),"utf8")).join("");
const built = bootstrap + source;
writeFileSync("dist-worker.js", built, "utf8");
console.log("Built", parts.length, "parts with runtime UTF-8 response repair,", built.length, "bytes");
