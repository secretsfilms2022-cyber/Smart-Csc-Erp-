ray.from(buf,function(c){return c.charCodeAt(0)}))}catch(e){out+=buf}buf=""}out+=x[i]}}if(buf){try{out+=new TextDecoder("utf-8").decode(Uint8Array.from(buf,function(c){return c.charCodeAt(0)}))}catch(e){out+=buf}}if(out===x)break;x=out}return x}
async function atomicMcpCall(toolName,args){
 const key=(typeof ATOMIC_MAIL_API_KEY!=="undefined"?ATOMIC_MAIL_API_KEY:"");
 if(!key)throw new Error("Atomic Mail is not configured on the ERP Worker. Add the ATOMIC_MAIL_API_KEY secret in Cloudflare Worker secrets.");
 const endpoint="https://mcp.atomicmail.ai/mcp";
 async function post(body,sessionId){
  const hd={"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"application/json, text/event-stream"};
  if(sessionId)hd["Mcp-Session-Id"]=sessionId;
  return fetch(endpoint,{method:"POST",headers:hd,body:JSON.stringify(body)});
 }
 const init=await post({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"smart-csc-erp",version:"1.0.0"}}});
 if(!init.ok)throw new Error("Atomic Mail MCP initialization failed (HTTP "+init.status+").");
 const sid=init.headers.get("mcp-session-id")||init.headers.get("Mcp-Session-Id")||null;
 await post({jsonrpc:"2.0",method:"notifications/initialized",params:{}},sid);
 const rr=await post({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:toolName,arguments:args||{}}},sid);
 const ct=rr.headers.get("content-type")||"";
 const raw=await rr.text();
 if(!rr.ok)throw new Error("Atomic Mail MCP request failed (HTTP "+rr.status+").");
 let data=null;
 if(ct.includes("text/event-stream")){
  const lines=raw.split(/\\r?\\n/).filter(function(x){return x.indexOf("data:")===0}).map(function(x){return x.slice(5).trim()}).filter(Boolean);
  if(lines.length)try{data=JSON.parse(lines[lines.length-1])}catch(e){}
 }else{try{data=raw?JSON.parse(raw):null}catch(e){}}
 if(!data)throw new Error("Atomic Mail returned an unreadable MCP response.");
 if(data.error)throw new Error(data.error.message||"Atomic Mail MCP error");
 return data.result||data;
}
async function atomicEmailHandler(req,url){
 const authz=req.headers.get("Authorization")||"";
 if(!authz)return new Response(JSON.stringify({message:"No session"}),{status:401,headers:{"content-type":"application/json","cache-control":"no-store"}});
 try{
  if(url.pathname==="/api/email/status"&&req.method==="GET"){
   const r=await atomicMcpCall("list_agents",{});return new Response(JSON.stringify({ok:true,provider:"Atomic Mail",mailbox:"surajkatira@smartcsc.work.gd",agents:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/inbox"&&req.method==="GET"){
   const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit")||25)));const r=await atomicMcpCall("read_inbox",{limit});return new Response(JSON.stringify({ok:true,messages:r.messages||r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/message"&&req.method==="GET"){
   const id=url.searchParams.get("id")||"";if(!id)return new Response(JSON.stringify({message:"Message id is required"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("read_message",{message_id:id});return new Response(JSON.stringify({ok:true,message:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/send"&&req.method==="POST"){
   const b=await req.json().catch(function(){return{}});const to=b.to,subject=String(b.subject||"").trim(),body=String(b.body||"");if(!to||!subject||!body)return new Response(JSON.stringify({message:"to, subject and body are required"}),{status:400,headers:{"content-type":"application/json"}});if(subject.length>200||body.length>100000)return new Response(JSON.stringify({message:"Email content exceeds the allowed limit"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("send_email",{to,subject,body});return new Response(JSON.stringify({ok:true,result:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/reply"&&req.method==="POST"){
   const b=await req.json().catch(function(){return{}});const id=String(b.message_id||""),body=String(b.body||"");if(!id||!body)return new Response(JSON.stringify({message:"message_id and body are required"}),{status:400,headers:{"content-type":"application/json"}});if(body.length>100000)return new Response(JSON.stringify({message:"Email body exceeds the allowed limit"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("reply_to_message",{message_id:id,body});return new Response(JSON.stringify({ok:true,result:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  return null;
 }catch(e){return new Response(JSON.stringify({ok:false,message:e&&e.message||"Atomic Mail request failed"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}})}
}
\nconst RENDER_HTML=repairUtf8Mojibake(HTML);
addEventListener("fetch",function(ev){const u=new URL(ev.request.url);ev.respondWith((async function(){const e=await atomicEmailHandler(ev.request,u);if(e)return e;const a=await apiHandler(ev.request,u);if(a)return a;if(u.pathname==="/health")return new Response(JSON.stringify({ok:true,service:"smart-csc-erp",version:"erp-ui-11"}),{headers:{"content-type":"application/json","cache-control":"no-store"}});if(u.pathname==="/app.js"){try{return new Response(repairUtf8Mojibake(LOGIN_APP_JS),{headers:{"content-type":"application/javascript;charset=UTF-8","cache-control":"no-store, no-cache, must-revalidate, max-age=0"}})}catch(ex){console.error("APP_JS_ROUTE_FAILURE",ex&&ex.stack||ex);return new Response("APP_JS_ROUTE_FAILURE: "+String(ex&&ex.stack||ex),{status:500,headers:{"content-type":"text/plain;charset=UTF-8","cache-control":"no-store"}})}}return new Response(RENDER_HTML,{headers:{"content-type":"text/html;charset=UTF-8","cache-control":"no-store"}})})())});
/* FACE_EMBEDDING_FIX_V5_1024_TO_128 */