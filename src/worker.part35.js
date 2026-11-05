const RENDER_HTML=repairUtf8Mojibake(HTML);

async function atomicMcpCall(toolName,args){
 const key=(typeof ATOMIC_MAIL_API_KEY!=="undefined"?String(ATOMIC_MAIL_API_KEY||""):"");
 if(!key)throw new Error("Atomic Mail is not configured");
 const endpoint="https://mcp.atomicmail.ai/mcp";
 const post=async(body,sid)=>{const h={"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"application/json, text/event-stream"};if(sid)h["Mcp-Session-Id"]=sid;return fetch(endpoint,{method:"POST",headers:h,body:JSON.stringify(body)})};
 const init=await post({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"smart-csc-erp",version:"1.0.0"}}});
 if(!init.ok)throw new Error("Atomic Mail MCP initialization failed (HTTP "+init.status+")");
 const sid=init.headers.get("mcp-session-id")||init.headers.get("Mcp-Session-Id")||null;
 await post({jsonrpc:"2.0",method:"notifications/initialized",params:{}},sid);
 const rr=await post({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:toolName,arguments:args||{}}},sid);
 const raw=await rr.text(); if(!rr.ok)throw new Error("Atomic Mail MCP request failed (HTTP "+rr.status+")");
 const ct=rr.headers.get("content-type")||""; let data=null;
 if(ct.includes("text/event-stream")){for(const line of raw.split(/\r?\n/).filter(x=>x.startsWith("data:"))){try{data=JSON.parse(line.slice(5).trim())}catch(e){}}}
 else{try{data=raw?JSON.parse(raw):null}catch(e){}}
 if(!data)throw new Error("Atomic Mail returned an unreadable response");
 if(data.error)throw new Error(data.error.message||"Atomic Mail MCP error");
 return data.result||data;
}
function b64Bytes(v){const raw=atob(v);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
async function verifyAtomicWebhook(req,raw,event){
 const id=req.headers.get("webhook-id")||"",ts=req.headers.get("webhook-timestamp")||"",sig=req.headers.get("webhook-signature")||"";
 const secrets=[typeof ATOMIC_MAIL_WEBHOOK_SECRET!=="undefined"?String(ATOMIC_MAIL_WEBHOOK_SECRET||""):"",typeof ATOMIC_MAIL_WEBHOOK_SECRET_PREVIOUS!=="undefined"?String(ATOMIC_MAIL_WEBHOOK_SECRET_PREVIOUS||""):""].filter(Boolean);
 if(event&&event.type==="verification"&&!secrets.length)return true;
 if(!secrets.length||!id||!ts||!sig)throw new Error("Webhook authentication is not configured");
 const n=Number(ts);if(!/^\d+$/.test(ts)||!Number.isFinite(n)||Math.abs(Math.floor(Date.now()/1000)-n)>300)throw new Error("Webhook timestamp outside tolerance");
 for(const secret of secrets){ const key=await crypto.subtle.importKey("raw",b64Bytes(secret.replace(/^whsec_/,"")),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const data=new TextEncoder().encode(id+"."+ts+"."+raw);
 for(const entry of sig.split(/\s+/).filter(x=>x.startsWith("v1,"))){try{if(await crypto.subtle.verify("HMAC",key,b64Bytes(entry.slice(3)),data))return true}catch(e){}} }
 throw new Error("Invalid webhook signature");
}
async function atomicWebhookHandler(req,ctx){
 const raw=await req.text();let event;try{event=JSON.parse(raw)}catch(e){return new Response("Invalid JSON",{status:400})}
 if(!event||typeof event!=="object"||Array.isArray(event))return new Response("Invalid event",{status:400});
 if(event.type==="verification"){const challenge=event.challenge;if(typeof challenge!=="string"||!challenge)return new Response(JSON.stringify({message:"Invalid verification challenge"}),{status:400,headers:{"content-type":"application/json"}});return new Response(JSON.stringify({challenge}),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}})}
 try{await verifyAtomicWebhook(req,raw,event)}catch(e){return new Response("Unauthorized",{status:401})}
 if(event.type!=="message.received")return new Response(null,{status:204});
 const d=event.data||{},messageId=String(d.message_id||"");if(!messageId)return new Response(null,{status:204});
 const process=async()=>{try{
  const systemKey=typeof SUPABASE_SECRET_KEY!=="undefined"?String(SUPABASE_SECRET_KEY||""):KEY;
  const existing=await fetch(SB+"/rest/v1/customer_communications?business_id=eq."+encodeURIComponent(BIZ)+"&provider=eq.atomicmail&provider_message_id=eq."+encodeURIComponent(messageId)+"&select=id&limit=1",{headers:{apikey:systemKey}}).then(x=>x.json().catch(()=>[]));
  if(existing&&existing.length)return;
  const full=await atomicMcpCall("read_message",{message_id:messageId});
  const from=full?.from?.[0]?.email||d.from?.[0]?.email||"",to=full?.to?.[0]?.email||"helpline@smartcsc.work.gd";
  const ah={apikey:systemKey,"Content-Type":"application/json"};
  const cs=await fetch(SB+"/rest/v1/customers?business_id=eq."+encodeURIComponent(BIZ)+"&email=ilike."+encodeURIComponent(from)+"&select=id,full_name,email&limit=1",{headers:ah}).then(x=>x.json().catch(()=>[]));
  const c=cs?.[0]||null;
  const ins=await fetch(SB+"/rest/v1/customer_communications",{method:"POST",headers:Object.assign({},ah,{Prefer:"return=minimal"}),body:JSON.stringify({business_id:BIZ,customer_id:c?.id||null,channel:"email",message_type:"email",recipient_name:c?.full_name||from||"Email contact",recipient_mobile:null,message:String(full?.body||""),status:"received",related_type:"email",related_id:null,opened_at:null,sent_at:null,created_by:null,provider:"atomicmail",provider_message_id:messageId,thread_id:full?.threadId||d.thread_id||null,direction:"inbound",sender_email:from,recipient_email:to,subject:String(full?.subject||""),provider_status:"received",received_at:full?.receivedAt||d.received_at||null})});
  if(!ins.ok)console.error("ATOMIC_MAIL_WEBHOOK_DB_INSERT_FAILED",await ins.text().catch(()=>""));
 }catch(e){console.error("ATOMIC_MAIL_WEBHOOK_PROCESSING_FAILED",e?.stack||e)}};
 if(ctx?.waitUntil)ctx.waitUntil(process());else process();
 return new Response(null,{status:204});
}
async function atomicAuth(req){
 const authz=req.headers.get("Authorization")||"";if(!/^Bearer\s+\S+$/i.test(authz))return null;
 const ur=await fetch(SB+"/auth/v1/user",{headers:{apikey:KEY,Authorization:authz}});if(!ur.ok)return null;
 const user=await ur.json().catch(()=>null);if(!user?.id)return null;
 const pr=await fetch(SB+"/rest/v1/profiles?id=eq."+encodeURIComponent(user.id)+"&select=id,business_id,full_name&limit=1",{headers:{apikey:KEY,Authorization:authz}});if(!pr.ok)return null;
 const profile=(await pr.json().catch(()=>[]))[0];if(!profile?.business_id)return null;return {authz,user,profile};
}
async function atomicSB(session,path,options){const headers=Object.assign({apikey:KEY,Authorization:session.authz,"Content-Type":"application/json"},options?.headers||{});return fetch(SB+path,Object.assign({},options||{},{headers}))}
async function atomicEmailSync(session){
 const now=new Date().toISOString(),inbox=await atomicMcpCall("read_inbox",{limit:50}),messages=inbox.messages||inbox||[];
 let imported=0,scanned=0,lastReceived=null,lastMessageId=null;
 for(const m of messages){scanned++;if(m.receivedAt&&(!lastReceived||m.receivedAt>lastReceived)){lastReceived=m.receivedAt;lastMessageId=m.id||null}if(!m.id)continue;
  const exists=await atomicSB(session,"/rest/v1/customer_communications?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&provider=eq.atomicmail&provider_message_id=eq."+encodeURIComponent(m.id)+"&select=id&limit=1").then(x=>x.json().catch(()=>[]));if(exists?.length)continue;
  const full=await atomicMcpCall("read_message",{message_id:m.id}),from=full?.from?.[0]?.email||m.from?.[0]?.email||"",to=full?.to?.[0]?.email||"helpline@smartcsc.work.gd";
  const customers=await atomicSB(session,"/rest/v1/customers?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&email=ilike."+encodeURIComponent(from)+"&select=id,full_name,email&limit=2").then(x=>x.json().catch(()=>[])),c=customers?.[0]||null;
  const ir=await atomicSB(session,"/rest/v1/customer_communications",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({business_id:session.profile.business_id,customer_id:c?.id||null,channel:"email",message_type:"email",recipient_name:c?.full_name||from||"Email contact",recipient_mobile:null,message:String(full?.body||m.preview||""),status:"received",related_type:"email",related_id:null,opened_at:null,sent_at:null,created_by:session.user.id,provider:"atomicmail",provider_message_id:m.id,thread_id:full?.threadId||null,direction:"inbound",sender_email:from,recipient_email:to,subject:String(full?.subject||m.subject||""),provider_status:"received",received_at:full?.receivedAt||m.receivedAt||now})});if(ir.ok)imported++;
 }
 const state={business_id:session.profile.business_id,provider:"atomicmail",mailbox:"helpline@smartcsc.work.gd",last_sync_at:now,last_received_at:lastReceived,last_message_id:lastMessageId,last_error:null,sync_status:"success",messages_scanned:scanned,messages_imported:imported,updated_at:now};
 await atomicSB(session,"/rest/v1/email_sync_state?on_conflict=business_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(state)});
 return {scanned,imported,last_received_at:lastReceived,last_message_id:lastMessageId,synced_at:now};
}
async function atomicEmailHandler(req,url){
 if(!url.pathname.startsWith("/api/email/"))return null;
 if(url.pathname==="/api/email/webhook"&&req.method==="POST")return await atomicWebhookHandler(req);
 const session=await atomicAuth(req);if(!session)return new Response(JSON.stringify({message:"Unauthorized"}),{status:401,headers:{"content-type":"application/json","cache-control":"no-store"}});
 try{
  if(url.pathname==="/api/email/status"&&req.method==="GET"){const r=await atomicMcpCall("list_agents",{});return new Response(JSON.stringify({ok:true,provider:"Atomic Mail",mailbox:"helpline@smartcsc.work.gd",agents:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}
  if(url.pathname==="/api/email/sync"&&req.method==="POST"){try{const result=await atomicEmailSync(session);return new Response(JSON.stringify({ok:true,result}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}catch(e){return new Response(JSON.stringify({ok:false,message:"Email sync failed"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}})}}
  if(url.pathname==="/api/email/templates"&&req.method==="GET"){const r=await atomicSB(session,"/rest/v1/email_templates?business_id=eq."+encodeURIComponent(session.profile.business_id)+"&select=id,template_key,name,subject_template,body_template,enabled&order=template_key.asc");const data=await r.json().catch(function(){return[]});return new Response(JSON.stringify({ok:r.ok,templates:data}),{status:r.ok?200:502,headers:{"content-type":"application/json","cache-control":"no-store"}})}
  if(url.pathname==="/api/email/templates"&&req.method==="PATCH"){const b=await req.json().catch(function(){return{}}),id=String(b.id||"");if(!id)return new Response(JSON.stringify({message:"Template id is required"}),{status:400,headers:{"content-type":"application/json"}});const allowed={name:String(b.name||"").slice(0,120),subject_template:String(b.subject_template||"").slice(0,300),body_template:String(b.body_template||"").slice(0,20000),enabled:b.enabled!==false,updated_by:session.user.id,updated_at:new Date().toISOString()};const r=await atomicSB(session,"/rest/v1/email_templates?id=eq."+encodeURIComponent(id)+"&business_id=eq."+encodeURIComponent(session.profile.business_id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(allowed)});if(!r.ok)return new Response(JSON.stringify({message:"Unable to update template"}),{status:502,headers:{"content-type":"application/json"}});return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}
  if(url.pathname==="/api/email/inbox"&&req.method==="GET"){const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit")||25))),r=await atomicMcpCall("read_inbox",{limit});return new Response(JSON.stringify({ok:true,messages:r.messages||r}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}
  if(url.pathname==="/api/email/message"&&req.method==="GET"){const id=url.searchParams.get("id")||"";if(!id)return new Response(JSON.stringify({message:"Message id is required"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("read_message",{message_id:id});return new Response(JSON.stringify({ok:true,message:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}
  if(url.pathname==="/api/email/send"&&req.method==="POST"){const b=await req.json().catch(()=>({})),to=b.to,cc=b.cc,bcc=b.bcc,subject=String(b.subject||"").trim(),body=String(b.body||""),attachments=Array.isArray(b.attachments)?b.attachments:[];if(!to||!subject||!body)return new Response(JSON.stringify({message:"to, subject and body are required"}),{status:400,headers:{"content-type":"application/json"}});if(subject.length>200||body.length>100000||attachments.length>10)return new Response(JSON.stringify({message:"Email content or attachment count exceeds the allowed limit"}),{status:400,headers:{"content-type":"application/json"}});for(const a of attachments){if(!a||!a.filename||!a.data_base64||String(a.data_base64).length>12*1024*1024)return new Response(JSON.stringify({message:"Attachment is invalid or too large"}),{status:400,headers:{"content-type":"application/json"}})}const r=await atomicMcpCall("send_email",{to,subject,body,cc,bcc,attachments}),recipient=Array.isArray(to)?String(to[0]||""):String(to),providerId=String(r?.id||r?.message_id||r?.messageId||"");const ins=await atomicSB(session,"/rest/v1/customer_communications",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({business_id:session.profile.business_id,customer_id:b.customer_id||null,channel:"email",message_type:"email",recipient_name:recipient,recipient_mobile:null,message:body,status:"sent",related_type:b.application_id?"application":"email",related_id:b.application_id||null,opened_at:null,sent_at:new Date().toISOString(),created_by:session.user.id,provider:"atomicmail",provider_message_id:providerId||null,thread_id:b.thread_id||null,direction:"outbound",sender_email:"helpline@smartcsc.work.gd",recipient_email:recipient,subject,provider_status:"sent",received_at:null})});const rec=await ins.json().catch(()=>[]),comm=Array.isArray(rec)?rec[0]:rec;if(comm?.id)await atomicSB(session,"/rest/v1/mail_metadata",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({business_id:session.profile.business_id,communication_id:comm.id,provider_message_id:providerId||null,folder:"sent",is_read:true,created_by:session.user.id})});return new Response(JSON.stringify({ok:true,result:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}
  if(url.pathname==="/api/email/reply"&&req.method==="POST"){const b=await req.json().catch(()=>({})),id=String(b.message_id||""),body=String(b.body||""),attachments=Array.isArray(b.attachments)?b.attachments:[];if(!id||!body)return new Response(JSON.stringify({message:"message_id and body are required"}),{status:400,headers:{"content-type":"application/json"}});const r=await atomicMcpCall("reply_to_message",{message_id:id,body,attachments});const full=await atomicMcpCall("read_message",{message_id:id}).catch(()=>null),providerId=String(r?.id||r?.message_id||r?.messageId||""),to=full?.from?.[0]?.email||"",subject=String(full?.subject||"").replace(/^Re:\s*/i,""),threadId=full?.threadId||null;if(to)await atomicSB(session,"/rest/v1/customer_communications",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({business_id:session.profile.business_id,customer_id:b.customer_id||null,channel:"email",message_type:"email",recipient_name:to,recipient_mobile:null,message:body,status:"sent",related_type:b.application_id?"application":"email",related_id:b.application_id||null,opened_at:null,sent_at:new Date().toISOString(),created_by:session.user.id,provider:"atomicmail",provider_message_id:providerId||null,thread_id:threadId,direction:"outbound",sender_email:"helpline@smartcsc.work.gd",recipient_email:to,subject:"Re: "+subject,provider_status:"sent",received_at:null})});return new Response(JSON.stringify({ok:true,result:r}),{headers:{"content-type":"application/json","cache-control":"no-store"}})}
  return null;
 }catch(e){console.error("ATOMIC_MAIL_HANDLER_FAILED",e?.stack||e);return new Response(JSON.stringify({ok:false,message:e?.message||"Atomic Mail request failed"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}})}
}


addEventListener("fetch",function(ev){const u=new URL(ev.request.url);ev.respondWith((async function(){if(u.pathname==="/api/email/webhook"&&ev.request.method==="POST"){const raw=await ev.request.text().catch(function(){return""});try{const event=JSON.parse(raw);if(event&&event.type==="verification"&&typeof event.challenge==="string"){return new Response(JSON.stringify({challenge:event.challenge}),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}})}}catch(_e){}return await atomicWebhookHandler(new Request(ev.request.url,{method:ev.request.method,headers:ev.request.headers,body:raw}),ev)}const e=await atomicEmailHandler(ev.request,u);if(e)return e;const a=await apiHandler(ev.request,u);if(a)return a;if(u.pathname==="/health")return new Response(JSON.stringify({ok:true,service:"smart-csc-erp",version:"erp-ui-11"}),{headers:{"content-type":"application/json","cache-control":"no-store"}});if(u.pathname==="/app.js"){try{return new Response(repairUtf8Mojibake(LOGIN_APP_JS+MAIL_MODULE_JS),{headers:{"content-type":"application/javascript;charset=UTF-8","cache-control":"no-store, no-cache, must-revalidate, max-age=0"}})}catch(ex){console.error("APP_JS_ROUTE_FAILURE",ex&&ex.stack||ex);return new Response("APP_JS_ROUTE_FAILURE: "+String(ex&&ex.stack||ex),{status:500,headers:{"content-type":"text/plain;charset=UTF-8","cache-control":"no-store"}})}}return new Response(RENDER_HTML,{headers:{"content-type":"text/html;charset=UTF-8","cache-control":"no-store"}})})())});
/* FACE_EMBEDDING_FIX_V5_1024_TO_128 */