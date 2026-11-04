import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const parts = readdirSync(dir)
  .filter((name) => /^worker\.part\d+\.js$/.test(name))
  .sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!parts.length) throw new Error("No worker source parts found");

function repairSegment(segment) {
  let out = segment;
  for (let pass = 0; pass < 24; pass++) {
    if (!/[\u00C3\u00C2\u00E2]/.test(out)) break;
    try {
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === out) break;
      out = decoded;
    } catch { break; }
  }
  return out;
}

function repairUtf8Mojibake(value) {
  return String(value ?? "").replace(/[\u0000-\u00FF]+/g, segment =>
    /[\u00C3\u00C2\u00E2]/.test(segment) ? repairSegment(segment) : segment
  );
}

function repairSourceLiterals(source) {
  return source.replace(/(["'`])(?:\\.|(?!\1)[\\s\\S])*?\1/g, (literal) => {
    const quote = literal[0];
    const body = literal.slice(1, -1);
    return quote + repairUtf8Mojibake(body) + quote;
  });
}

const bootstrap = `
function repairUtf8Mojibake(value){
  function repairSegment(segment){
    var out=segment;
    for(var pass=0;pass<24;pass++){
      if(!/[\\u00C3\\u00C2\\u00E2]/.test(out)) break;
      try{
        var bytes=new Uint8Array(out.length);
        for(var i=0;i<out.length;i++) bytes[i]=out.charCodeAt(i);
        var decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
        if(decoded===out) break;
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

const DOM_MOJIBAKE_REPAIR_SCRIPT = `
(function(){
  function repair(value){
    var out=String(value==null?"":value);
    for(var pass=0;pass<24;pass++){
      if(!/[\\u00C3\\u00C2\\u00E2]/.test(out)) break;
      try{
        var bytes=new Uint8Array(out.length);
        for(var i=0;i<out.length;i++){
          var code=out.charCodeAt(i);
          if(code>255) throw new Error("non-latin1");
          bytes[i]=code;
        }
        var decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
        if(decoded===out) break;
        out=decoded;
      }catch(e){break}
    }
    return out;
  }
  function clean(root){
    var base=root||document;
    var w=document.createTreeWalker(base,NodeFilter.SHOW_TEXT);
    var n;
    while(n=w.nextNode()) if(/[\\u00C3\\u00C2\\u00E2]/.test(n.nodeValue)) n.nodeValue=repair(n.nodeValue);
    var els=base.querySelectorAll?base.querySelectorAll("[title],[placeholder],[aria-label],[value]"):[];
    for(var i=0;i<els.length;i++) ["title","placeholder","aria-label","value"].forEach(function(a){
      if(els[i].hasAttribute(a)){var v=els[i].getAttribute(a);if(/[\\u00C3\\u00C2\\u00E2]/.test(v))els[i].setAttribute(a,repair(v));}
    });
  }
  function start(){
    clean(document);
    new MutationObserver(function(ms){
      for(var i=0;i<ms.length;i++){
        var m=ms[i];
        if(m.type==="characterData") clean(m.target.parentNode||document);
        else if(m.type==="childList") for(var j=0;j<m.addedNodes.length;j++) if(m.addedNodes[j].nodeType===1) clean(m.addedNodes[j]);
      }
    }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
    setInterval(function(){clean(document)},1500);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();
})();
`;

const repairedParts = parts.map((name) => repairSourceLiterals(readFileSync(join(dir,name),"utf8")));
const source = repairedParts.join("");
const runtimeBootstrap = bootstrap + "\nconst DOM_MOJIBAKE_REPAIR_SCRIPT = " + JSON.stringify(DOM_MOJIBAKE_REPAIR_SCRIPT) + ";\n";
const built = runtimeBootstrap + source;
const finalSource = built.replace(
  'return new Response(repairUtf8Mojibake(LOGIN_APP_JS),',
  'return new Response(repairUtf8Mojibake(LOGIN_APP_JS)+DOM_MOJIBAKE_REPAIR_SCRIPT,'
);
writeFileSync("dist-worker.js", finalSource, "utf8");
console.log("Built", parts.length, "parts with source-literal + runtime + DOM UTF-8 repair,", finalSource.length, "bytes");
