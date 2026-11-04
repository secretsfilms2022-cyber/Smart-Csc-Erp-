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
function b64Bytes(v){
 const raw=atob(v);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
async function verifyAtomicWebhook(req,raw,event){
 const id=req.headers.get("webhook-id")||"",ts=req.headers.get("webhook-timestamp")||"",sig=req.headers.get("webhook-signature")||"";
 const secret=typeof ATOMIC_MAIL_WEBHOOK_SECRET!=="undefined"?String(ATOMIC_MAIL_WEBHOOK_SECRET||""):"";
 if(event&&event.type==="verification"&&!secret)return true;
 if(!secret||!id||!ts||!sig)throw new Error("Webhook authentication is not configured");
 const n=Number(ts);if(!/^\d+$/.test(ts)||!Number.isFinite(n)||Math.abs(Math.floor(Date.now()/1000)-n)>300)throw new Error("Webhook timestamp outside tolerance");
 const keyBytes=b64Bytes(secret.replace(/^whsec_/,""));
 const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const data=new TextEncoder().encode(id+"."+ts+"."+raw);
 const entries=sig.split(/\s+/).filter(function(x){return x.indexOf("v1,")===0});
 for(const entry of entries){try{if(await crypto.subtle.verify("HMAC",key,b64Bytes(entry.slice(3)),data))return true}catch(e){}}
 throw new Error("Invalid webhook signature");
}
async function atomicWebhookHandler(req){
 const raw=await req.text();let event=null;try{event=JSON.parse(raw)}catch(e){return new Response("Invalid JSON",{status:400})}
 if(!event||typeof event!=="object"||Array.isArray(event))return new Response("Invalid event",{status:400});
 if(event.type==="verification"){
  try{
   // Atomic Mail's initial endpoint verification must be answered with the
   // challenge before delivery signing is enforced. Signature verification
   // applies to subsequent message.received deliveries.
   const challenge=event.challenge;
   if(typeof challenge!=="string"||!challenge)return new Response(JSON.stringify({message:"Invalid verification challenge"}),{status:400,headers:{"content-type":"application/json"}});
   return new Response(JSON.stringify({challenge}),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}});
  }catch(e){return new Response(JSON.stringify({message:"Unauthorized"}),{status:401,headers:{"content-type":"application/json","cache-control":"no-store"})}
 }
 try{await verifyAtomicWebhook(req,raw,event)}catch(e){return new Response("Unauthorized",{status:401})}
 if(event.type!=="message.received")return new Response(null,{status:204});
 const d=event.data||{},messageId=String(d.message_id||"");if(!messageId)return new Response(null,{status:204});
 const systemKey=typeof SUPABASE_SECRET_KEY!=="undefined"?String(SUPABASE_SECRET_KEY||""):KEY;const existing=await fetch(SB+"/rest/v1/customer_communications?business_id=eq."+encodeURIComponent(BIZ)+"&provider=eq.atomicmail&provider_message_id=eq."+encodeURIComponent(messageId)+"&select=id&limit=1",{headers:{apikey:systemKey}}).then(function(x){return x.json().catch(function(){return[]})});
 if(existing&&existing.length)return new Response(null,{status:204});
 const full=await atomicMcpCall("read_message",{message_id:messageId});
 const from=full&&full.from&&full.from[0]&&full.from[0].email||d.from&&d.from[0]&&d.from[0].email||"";
 const to=full&&full.to&&full.to[0]&&full.to[0].email||"surajkatira@smartcsc.work.gd";
 const ah={apikey:systemKey,"Content-Type":"application/json"};
 const cr=await fetch(SB+"/rest/v1/customers?business_id=eq."+encodeURIComponent(BIZ)+"&email=ilike."+encodeURIComponent(from)+"&select=id,full_name,email&limit=1",{headers:{apikey:systemKey}});const cs=await cr.json().catch(function(){return[]});const c=cs&&cs[0]||null;
 await fetch(SB+"/rest/v1/customer_communications",{method:"POST",headers:Object.assign({},ah,{Prefer:"return=minimal"}),body:JSON.stringify({business_id:BIZ,customer_id:c&&c.id||null,channel:"email",message_type:"email",recipient_name:c&&c.full_name||from||"Email contact",recipient_mobile:null,message:String(full&&full.body||""),status:"received",related_type:"email",related_id:null,opened_at:null,sent_at:null,created_by:null,provider:"atomicmail",provider_message_id:messageId,thread_id:full&&full.threadId||d.thread_id||null,direction:"inbound",sender_email:from,recipient_email:to,subject:String(full&&full.subject||""),provider_status:"received",received_at:full&&full.receivedAt||d.received_at||null})});
 return new Response(null,{status:204});
}
async function atomicAuth(req){
 const authz=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authz))return null;
 const ur=await fetch(SB+"/auth/v1/user",{headers:{apikey:KEY,Authorization:authz}});
 if(!ur.ok)return null;
 const user=await ur.json().catch(function(){return null});
 if(!user||!user.id)return null;
 const pr=await fetch(SB+"/rest/v1/profiles?id=eq."+encodeURIComponent(user.id)+"&select=id,business_id,full_name&limit=1",{headers:{apikey:KEY,Authorization:authz}});
 if(!pr.ok)return null;
 const profile=(await pr.json().catch(function(){return[]}))[0];
 if(!profile||!profile.business_id)return null;
 return {authz,user,profile};
}
async function atomicSB(session,path,options){
 const headers=Object.assign({apikey:KEY,Authorization:session.authz,"Content-Type":"application/json"},(options&&options.headers)||{});
 return fetch(SB+path,Object.assign({},options||{},{headers}));
}
async function atomicEmailSync(session){
 const now=new Date().toISOString();
 const inbox=await atomicMcpCall("read_inbox",{limit:50});
 const messages=inbox.messages||inbox||[];
 let imported=0,scanned=0,lastReceived=null,lastMessageId=null;
 for(const m of messages){
  scanned++;
  if(m.receivedAt&&(!lastReceived||m.receivedAt>lastReceived)){lastReceived=m.receivedAt;lastMessageId=m.id||null;}
  if(!m.id)continue;
  const exists=await atomicSB(session,"/rest/v1/customer_communications?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&provider=eq.atomicmail&provider_message_id=eq."+encodeURIComponent(m.id)+"&select=id&limit=1").then(function(x){return x.json().catch(function(){return[]})});
  if(exists&&exists.length)continue;
  const full=await atomicMcpCall("read_message",{message_id:m.id});
  const from=full&&full.from&&full.from[0]&&full.from[0].email||m.from&&m.from[0]&&m.from[0].email||"";
  const to=full&&full.to&&full.to[0]&&full.to[0].email||"surajkatira@smartcsc.work.gd";
  const cq="/rest/v1/customers?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&email=ilike."+encodeURIComponent(from)+"&select=id,full_name,email&limit=2";
  const cr=await atomicSB(session,cq); const customers=await cr.json().catch(function(){return[]});
  const customer=customers&&customers[0]||null;
  const payload={business_id:session.profile.business_id,customer_id:customer&&customer.id||null,channel:"email",message_type:"email",recipient_name:customer&&customer.full_name||from||"Email contact",recipient_mobile:null,message:String(full&&full.body||m.preview||""),status:"received",related_type:"email",related_id:null,opened_at:null,sent_at:null,created_by:session.user.id,provider:"atomicmail",provider_message_id:m.id,thread_id:full&&full.threadId||null,direction:"inbound",sender_email:from,recipient_email:to,subject:String(full&&full.subject||m.subject||""),provider_status:"received",received_at:full&&full.receivedAt||m.receivedAt||now};
  const ir=await atomicSB(session,"/rest/v1/customer_communications",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
  if(ir.ok)imported++;
 }
 const state={business_id:session.profile.business_id,provider:"atomicmail",mailbox:"surajkatira@smartcsc.work.gd",last_sync_at:now,last_received_at:lastReceived,last_message_id:lastMessageId,last_error:null,sync_status:"success",messages_scanned:scanned,messages_imported:imported,updated_at:now};
 await atomicSB(session,"/rest/v1/email_sync_state?on_conflict=business_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(state)});
 return {scanned,imported,last_received_at:lastReceived,last_message_id:lastMessageId,synced_at:now};
}
if(url.pathname==="/api/email/webhook"&&req.method==="POST")return await atomicWebhookHandler(req);\nasync function atomicEmailHandler(req,url){
 if(url.pathname==="/api/email/webhook"&&req.method==="POST")return await atomicWebhookHandler(req);
 const session=await atomicAuth(req);
 if(!session)return new Response(JSON.stringify({message:"Unauthorized"}),{status:401,headers:{"content-type":"application/json","cache-control":"no-store"}});
 try{
  if(url.pathname==="/api/email/status"&&req.method==="GET"){
   const r=await atomicMcpCall("list_agents",{});return new Response(JSON.stringify({ok:true,provider:"Atomic Mail",mailbox:"surajkatira@smartcsc.work.gd",agents:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/sync"&&req.method==="POST"){
   try{const result=await atomicEmailSync(session);return new Response(JSON.stringify({ok:true,result}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}catch(e){return new Response(JSON.stringify({ok:false,message:"Email sync failed"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}})}
  }
  if(url.pathname==="/api/email/templates"&&req.method==="GET"){
   const r=await atomicSB(session,"/rest/v1/email_templates?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&select=id,template_key,name,subject_template,body_template,enabled&order=template_key.asc");const data=await r.json().catch(function(){return[]});return new Response(JSON.stringify({ok:r.ok,templates:data}),{status:r.ok?200:502,headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/templates"&&req.method==="PATCH"){
   const b=await req.json().catch(function(){return{}}),id=String(b.id||"");if(!id)return new Response(JSON.stringify({message:"Template id is required"}),{status:400,headers:{"content-type":"application/json"}});
   const allowed={name:String(b.name||"").slice(0,120),subject_template:String(b.subject_template||"").slice(0,300),body_template:String(b.body_template||"").slice(0,20000),enabled:b.enabled!==false,updated_by:session.user.id,updated_at:new Date().toISOString()};
   const r=await atomicSB(session,"/rest/v1/email_templates?id=eq."+encodeURIComponent(id)+"&business_id=eq."+encodeURIComponent(session.profile.business_id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(allowed)});if(!r.ok)return new Response(JSON.stringify({message:"Unable to update template"}),{status:502,headers:{"content-type":"application/json"}});return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/inbox"&&req.method==="GET"){
   const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit")||25)));const r=await atomicMcpCall("read_inbox",{limit});return new Response(JSON.stringify({ok:true,messages:r.messages||r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/message"&&req.method==="GET"){
   const id=url.searchParams.get("id")||"";if(!id)return new Response(JSON.stringify({message:"Message id is required"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("read_message",{message_id:id});return new Response(JSON.stringify({ok:true,message:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/send"&&req.method==="POST"){
   const b=await req.json().catch(function(){return{}});const to=b.to,subject=String(b.subject||"").trim(),body=String(b.body||"");if(!to||!subject||!body)return new Response(JSON.stringify({message:"to, subject and body are required"}),{status:400,headers:{"content-type":"application/json"}});if(subject.length>200||body.length>100000)return new Response(JSON.stringify({message:"Email content exceeds the allowed limit"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("send_email",{to,subject,body});const recipient=Array.isArray(to)?String(to[0]||""):String(to);const cr=await atomicSB(session,"/rest/v1/customers?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&email=ilike."+encodeURIComponent(recipient)+"&select=id,full_name&limit=1");const cs=await cr.json().catch(function(){return[]});const providerId=String((r&&((r.id)||(r.message_id)||(r.messageId)))||"");await atomicSB(session,"/rest/v1/customer_communications",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({business_id:session.profile.business_id,customer_id:cs[0]&&cs[0].id||null,channel:"email",message_type:"email",recipient_name:cs[0]&&cs[0].full_name||recipient,recipient_mobile:null,message:body,status:"sent",related_type:"email",related_id:null,opened_at:null,sent_at:new Date().toISOString(),created_by:session.user.id,provider:"atomicmail",provider_message_id:providerId||null,thread_id:null,direction:"outbound",sender_email:"surajkatira@smartcsc.work.gd",recipient_email:recipient,subject:subject,provider_status:"sent",received_at:null})});return new Response(JSON.stringify({ok:true,result:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if(url.pathname==="/api/email/reply"&&req.method==="POST"){
   const b=await req.json().catch(function(){return{}});const id=String(b.message_id||""),body=String(b.body||"");if(!id||!body)return new Response(JSON.stringify({message:"message_id and body are required"}),{status:400,headers:{"content-type":"application/json"}});if(body.length>100000)return new Response(JSON.stringify({message:"Email body exceeds the allowed limit"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("reply_to_message",{message_id:id,body});let original=null;try{original=await atomicMcpCall("read_message",{message_id:id})}catch(e){}const recipient=String(original&&original.from&&original.from[0]&&original.from[0].email||"");const providerId=String((r&&((r.id)||(r.message_id)||(r.messageId)))||"");await atomicSB(session,"/rest/v1/customer_communications",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({business_id:session.profile.business_id,customer_id:null,channel:"email",message_type:"email",recipient_name:recipient||"Email contact",recipient_mobile:null,message:body,status:"sent",related_type:"email",related_id:null,opened_at:null,sent_at:new Date().toISOString(),created_by:session.user.id,provider:"atomicmail",provider_message_id:providerId||null,thread_id:original&&original.threadId||null,direction:"outbound",sender_email:"surajkatira@smartcsc.work.gd",recipient_email:recipient,subject:"Re: "+String(original&&original.subject||""),provider_status:"sent",received_at:null})});return new Response(JSON.stringify({ok:true,result:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  return null;
 }catch(e){return new Response(JSON.stringify({ok:false,message:e&&e.message||"Atomic Mail request failed"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}})}
}
`;
const RENDER_HTML=repairUtf8Mojibake(HTML);
addEventListener("fetch",function(ev){const u=new URL(ev.request.url);ev.respondWith((async function(){if(u.pathname==="/api/email/webhook"&&ev.request.method==="POST"){const raw=await ev.request.text().catch(function(){return""});try{const event=JSON.parse(raw);if(event&&event.type==="verification"&&typeof event.challenge==="string"){return new Response(JSON.stringify({challenge:event.challenge}),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}})}}catch(_e){}return await atomicWebhookHandler(new Request(ev.request,{body:raw}))}const e=await atomicEmailHandler(ev.request,u);if(e)return e;const a=await apiHandler(ev.request,u);if(a)return a;if(u.pathname==="/health")return new Response(JSON.stringify({ok:true,service:"smart-csc-erp",version:"erp-ui-11"}),{headers:{"content-type":"application/json","cache-control":"no-store"}});if(u.pathname==="/app.js"){try{return new Response(repairUtf8Mojibake(LOGIN_APP_JS),{headers:{"content-type":"application/javascript;charset=UTF-8","cache-control":"no-store, no-cache, must-revalidate, max-age=0"}})}catch(ex){console.error("APP_JS_ROUTE_FAILURE",ex&&ex.stack||ex);return new Response("APP_JS_ROUTE_FAILURE: "+String(ex&&ex.stack||ex),{status:500,headers:{"content-type":"text/plain;charset=UTF-8","cache-control":"no-store"}})}}return new Response(RENDER_HTML,{headers:{"content-type":"text/html;charset=UTF-8","cache-control":"no-store"}})})())});
/* FACE_EMBEDDING_FIX_V5_1024_TO_128 */