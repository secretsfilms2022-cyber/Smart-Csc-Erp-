import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const parts = readdirSync(dir)
  .filter((name) => /^worker\.part\d+\.js$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
if (!parts.length) throw new Error("No worker source parts found");

const bootstrap = `function repairUtf8Mojibake(value){
 const source=String(value==null?"":value);
 let out=source;
 for(let pass=0;pass<3;pass++){
  if(!/[ÃÂâ]/.test(out))break;
  try{
   const bytes=new Uint8Array(out.length);
   let ok=true;
   for(let i=0;i<out.length;i++){const code=out.charCodeAt(i);if(code>255){ok=false;break}bytes[i]=code}
   if(!ok)break;
   const decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
   if(decoded===out)break;
   out=decoded;
  }catch(e){break}
 }
 return out;
}
`;

const source = bootstrap + parts.map((name) => readFileSync(join(dir,name),"utf8")).join("");
writeFileSync("dist-worker.js", source, "utf8");
console.log("Built", parts.length, "parts + bootstrap,", source.length, "bytes");
