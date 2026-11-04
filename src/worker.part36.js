const MAIL_MODULE_JS = String.raw`
/* MAIL_MODULE_V1 */
(function(){
  "use strict";
  if(!Array.isArray(window.__mailModuleLoaded?[]:null)){}
  var mailState={folder:"inbox",rows:[],meta:[],templates:[],search:"",selected:null};
  function mailEsc(v){return typeof esc==="function"?esc(v):String(v==null?"":v).replace(/[&<>"]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":"&quot;"})}
  function mailDate(v){if(!v)return "—";try{return new Date(v).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"})}catch(e){return String(v)}}
  function mailAddr(a){if(Array.isArray(a))return a.map(function(x){return x&&x.email||""}).filter(Boolean).join(", ");return String(a||"")}
  async function mailRows(){
    var cr=await api("/rest/v1/customer_communications?business_id=eq."+encodeURIComponent(BIZ)+"&channel=eq.email&select=*&order=created_at.desc&limit=1000");
    var mr=await api("/rest/v1/mail_metadata?business_id=eq."+encodeURIComponent(BIZ)+"&select=*&order=updated_at.desc&limit=2000");
    var customers=await api("/rest/v1/customers?business_id=eq."+encodeURIComponent(BIZ)+"&select=id,full_name,email,mobile&limit=2000").catch(function(){return{data:[]}}),cm={};
    (customers.data||[]).forEach(function(x){cm[x.id]=x});
    var mm={};(mr.data||[]).forEach(function(x){if(x.communication_id)mm[x.communication_id]=x});
    mailState.meta=mr.data||[];
    var rows=(cr.data||[]).map(function(x){
      var m=mm[x.id]||{};
      var inferred=x.direction==="outbound"?"sent":"inbox";
      return Object.assign({},x,{_meta:m,_customer:cm[x.customer_id]||null,_folder:m.folder||inferred,_read:m.is_read!==false||inferred==="sent",_starred:!!m.is_starred,_important:!!m.is_important});
    });
    (mr.data||[]).filter(function(m){return m.folder==="draft"&&!m.communication_id}).forEach(function(m){
      rows.push({id:"draft:"+m.id,communication_id:null,provider_message_id:null,direction:"draft",sender_email:"helpline@smartcsc.work.gd",recipient_email:Array.isArray(m.draft_to)?m.draft_to.join(", "):"",subject:m.draft_subject||"(draft)",message:m.draft_body||"",thread_id:null,created_at:m.updated_at||m.created_at,_meta:m,_customer:null,_folder:"draft",_read:true,_starred:!!m.is_starred,_important:!!m.is_important});
    });
    return rows;
  }
  function mailMatches(r,q){
    if(!q)return true;
    var s=String(q).toLowerCase();
    return [r.subject,r.message,r.sender_email,r.recipient_email,r.thread_id,r.provider_message_id,r._customer&&r._customer.full_name,r._customer&&r._customer.email].some(function(v){return String(v||"").toLowerCase().indexOf(s)>=0});
  }
  function mailInFolder(r,f){
    if(f==="starred")return r._starred;
    if(f==="important")return r._important;
    if(f==="trash")return r._folder==="trash";
    if(f==="archive")return r._folder==="archive";
    if(f==="sent")return r._folder==="sent"&&!r._meta.is_trashed;
    if(f==="draft")return r._folder==="draft";
    return r._folder==="inbox"&&!r._meta.is_trashed&&!r._meta.is_archived;
  }
  async function mailEnsureMeta(r,patch){
    var id=r&&r._meta&&r._meta.id;
    if(id){
      var u=await api("/rest/v1/mail_metadata?id=eq."+encodeURIComponent(id)+"&business_id=eq."+encodeURIComponent(BIZ),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(Object.assign({},patch,{updated_at:new Date().toISOString()}))});
      return Array.isArray(u.data)?u.data[0]:u.data;
    }
    var p=Object.assign({business_id:BIZ,communication_id:r&&r.id||null,provider_message_id:r&&r.provider_message_id||null,folder:r&&r._folder||"inbox",is_read:r&&r._read!==false,is_starred:false,is_important:false,is_archived:false,is_trashed:false,created_by:user&&user.id||null},patch,{updated_at:new Date().toISOString()});
    var c=await api("/rest/v1/mail_metadata",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(p)});
    return Array.isArray(c.data)?c.data[0]:c.data;
  }
  async function mailRefreshCounts(rows){
    var counts={inbox:0,sent:0,draft:0,starred:0,important:0,archive:0,trash:0};
    (rows||[]).forEach(function(r){
      if(mailInFolder(r,"inbox"))counts.inbox++;
      if(mailInFolder(r,"sent"))counts.sent++;
      if(r._folder==="draft")counts.draft++;
      if(r._starred)counts.starred++;
      if(r._important)counts.important++;
      if(r._folder==="archive")counts.archive++;
      if(r._folder==="trash")counts.trash++;
    });
    Object.keys(counts).forEach(function(k){var e=document.querySelector("[data-mail-count='"+k+"']");if(e)e.textContent=counts[k]||""});
  }
  function mailFolderTitle(f){return f==="inbox"?"Inbox":f==="sent"?"Sent":f==="draft"?"Drafts":f==="starred"?"Starred":f==="important"?"Important":f==="archive"?"Archive":"Trash"}
  function mailRowHtml(r){
    var unread=!r._read&&r._folder==="inbox";
    var from=r.direction==="inbound"?(r.sender_email||"Unknown sender"):(r.recipient_email||"Recipient");
    var preview=String(r.message||"").replace(/\s+/g," ").slice(0,110);
    return "<tr class='mailrow "+(unread?"mail-unread":"")+"' data-mail-open='"+mailEsc(r.id)+"'>"+
      "<td style='width:28px'><input type='checkbox' data-mail-check='"+mailEsc(r.id)+"'></td>"+
      "<td style='width:34px'><button class='mail-iconbtn' data-mail-star='"+mailEsc(r.id)+"' title='Star'>"+(r._starred?"★":"☆")+"</button></td>"+
      "<td style='width:34px'><button class='mail-iconbtn' data-mail-important='"+mailEsc(r.id)+"' title='Important'>"+(r._important?"!":"·")+"</button></td>"+
      "<td><b>"+mailEsc(from)+"</b>"+(r._customer?"<div class='muted mail-small'>"+mailEsc(r._customer.full_name)+"</div>":"")+"</td>"+
      "<td><b>"+mailEsc(r.subject||"(no subject)")+"</b><div class='muted mail-preview'>"+mailEsc(preview)+"</div></td>"+
      "<td style='width:30px'>"+(r.attachments&&r.attachments.length?"📎":"")+"</td>"+
      "<td class='mail-date'>"+mailEsc(mailDate(r.created_at||r.received_at||r.sent_at))+"</td></tr>";
  }
  async function mailPage(){
    document.getElementById("main").innerHTML="<div class='panel mail-shell'><div class='mail-loading'>Loading Mail...</div></div>";
    try{
      mailState.rows=await mailRows();
      var tr=await api("/api/email/templates",{method:"GET"}).catch(function(){return{data:{templates:[]}}});
      mailState.templates=(tr.data&&tr.data.templates)||[];
      var h="<div class='mail-shell'>"+
        "<div class='mail-top'><div><h2>Mail</h2><div class='muted'>Two-way Atomic Mail workspace · Inbox, Sent, Drafts, Threads and ERP-linked communication</div></div>"+
        "<div class='mail-top-actions'><button class='btn secondary' id='mailSync'>↻ Sync Now</button><button class='btn' id='mailCompose'>+ Compose</button></div></div>"+
        "<div class='mail-layout'>"+
        "<aside class='mail-sidebar'><button class='btn mail-compose-side' id='mailCompose2'>+ Compose</button>"+
        ["inbox","starred","important","sent","draft","archive","trash"].map(function(f){return "<button class='mail-folder "+(mailState.folder===f?"active":"")+"' data-mail-folder='"+f+"'><span>"+({inbox:"✉",starred:"★",important:"!",sent:"↗",draft:"▣",archive:"▤",trash:"⌫"}[f])+"</span>"+mailFolderTitle(f)+"<em data-mail-count='"+f+"'></em></button>"}).join("")+
        "<div class='mail-divider'></div><button class='mail-folder' id='mailTemplates'>▧ Templates</button><div class='mail-account'><b>Connected account</b><span>helpline@smartcsc.work.gd</span><small id='mailSyncStatus'>Sync status: checking…</small></div></aside>"+
        "<section class='mail-main'><div class='mail-toolbar'><input id='mailSearch' placeholder='Search mail, sender, subject, customer, application...' value='"+mailEsc(mailState.search)+"'><button class='btn secondary' id='mailRefresh'>Refresh</button></div><div id='mailList'></div></section>"+
        "</div></div>";
      document.getElementById("main").innerHTML=h;
      document.querySelectorAll("[data-mail-folder]").forEach(function(b){b.onclick=function(){mailState.folder=b.getAttribute("data-mail-folder");mailRenderList()}});
      document.getElementById("mailCompose").onclick=mailCompose;
      document.getElementById("mailCompose2").onclick=mailCompose;
      document.getElementById("mailSync").onclick=mailSync;
      document.getElementById("mailRefresh").onclick=mailRenderList;
      document.getElementById("mailSearch").oninput=function(){mailState.search=this.value;mailRenderList()};
      document.getElementById("mailTemplates").onclick=function(){mailTemplateManager()};
      await mailRenderList();
      var sr=await api("/api/email/status",{method:"GET"}).catch(function(){return{data:null}});
      document.getElementById("mailSyncStatus").textContent=sr.data&&sr.data.ok?"Connected · Atomic Mail":"Connection status unavailable";
    }catch(e){document.getElementById("main").innerHTML="<div class='panel'><h2>Mail could not load</h2><p class='error'>"+mailEsc(e.message)+"</p><button class='btn' id='mailRetry'>Retry</button></div>";document.getElementById("mailRetry").onclick=mailPage}
  }
  async function mailRenderList(){
    var box=document.getElementById("mailList");if(!box)return;
    var rows=mailState.rows.filter(function(r){return mailInFolder(r,mailState.folder)&&mailMatches(r,mailState.search)});
    mailRefreshCounts(mailState.rows);
    var title=mailFolderTitle(mailState.folder);
    if(!rows.length){box.innerHTML="<div class='panel mail-empty'><div class='mail-empty-icon'>✉</div><h3>"+title+" is empty</h3><p class='muted'>No matching messages found.</p></div>";return}
    box.innerHTML="<div class='panel mail-panel'><div class='mail-list-head'><div><b>"+title+"</b><span class='muted'> · "+rows.length+" message(s)</span></div><span class='badge good'>LIVE</span></div><div class='tablewrap'><table class='table mail-table'><thead><tr><th></th><th>★</th><th>!</th><th>Sender / Recipient</th><th>Subject</th><th></th><th>Date</th></tr></thead><tbody>"+rows.map(mailRowHtml).join("")+"</tbody></table></div></div>";
    box.querySelectorAll("[data-mail-open]").forEach(function(b){b.onclick=function(e){if(e.target.closest("button,input"))return;mailOpen(b.getAttribute("data-mail-open"))}});
    box.querySelectorAll("[data-mail-star]").forEach(function(b){b.onclick=function(e){e.stopPropagation();mailToggle(b.getAttribute("data-mail-star"),"is_starred")}});
    box.querySelectorAll("[data-mail-important]").forEach(function(b){b.onclick=function(e){e.stopPropagation();mailToggle(b.getAttribute("data-mail-important"),"is_important")}});
  }
  async function mailToggle(id,field){
    var r=mailState.rows.find(function(x){return x.id===id});if(!r)return;
    var p={};p[field]=!r["_"+field.replace("is_","")];
    await mailEnsureMeta(r,p);r["_"+field.replace("is_","")]=p[field];if(r._meta)r._meta[field]=p[field];else r._meta={id:null};toast((p[field]?"Marked ":"Unmarked ")+(field==="is_starred"?"starred":"important"));mailRenderList();
  }
  async function mailSetFolder(r,folder){
    await mailEnsureMeta(r,{folder:folder,is_archived:folder==="archive",is_trashed:folder==="trash"});
    r._folder=folder;r._meta.folder=folder;r._meta.is_archived=folder==="archive";r._meta.is_trashed=folder==="trash";mailRenderList();
  }
  async function mailMarkRead(r,read){
    await mailEnsureMeta(r,{is_read:read});r._read=read;if(r._meta)r._meta.is_read=read;mailRenderList();
  }
  async function mailOpen(id){
    var r=mailState.rows.find(function(x){return x.id===id});if(!r)return;
    if(r._folder==="draft"&&!r.communication_id){
      mailCompose({title:"Edit Draft",to:Array.isArray(r._meta.draft_to)?r._meta.draft_to.join(", "):"",cc:Array.isArray(r._meta.draft_cc)?r._meta.draft_cc.join(", "):"",bcc:Array.isArray(r._meta.draft_bcc)?r._meta.draft_bcc.join(", "):"",subject:r._meta.draft_subject||"",body:r._meta.draft_body||""});
      return;
    }
    var detail=null;
    if(r.provider_message_id){var q=await api("/api/email/message?id="+encodeURIComponent(r.provider_message_id),{method:"GET"}).catch(function(){return{data:null}});detail=q.data&&q.data.message}
    if(detail&&r._folder==="inbox")await mailMarkRead(r,true);
    var thread=mailState.rows.filter(function(x){return r.thread_id&&x.thread_id===r.thread_id});
    if(thread.length<2)thread=[r];
    var body=detail&&detail.body||r.message||"";
    var from=detail?mailAddr(detail.from):r.sender_email||"";
    var to=detail?mailAddr(detail.to):r.recipient_email||"";
    var cc=detail?mailAddr(detail.cc):"";
    var attachments=(detail&&detail.attachments)||[];
    var linked=(r._customer?"<div class='mail-linkbox'><b>Customer:</b> "+mailEsc(r._customer.full_name)+" · "+mailEsc(r._customer.email||"")+" <button class='rowbtn' id='mailOpenCustomer'>Open</button></div>":"");
    var head="<div class='mail-read-head'><button class='btn secondary' id='mailBack'>← Back</button><div class='mail-read-actions'><button class='btn secondary' id='mailReply'>Reply</button><button class='btn secondary' id='mailForward'>Forward</button><button class='btn secondary' id='mailArchive'>Archive</button><button class='btn secondary' id='mailTrash'>Delete</button><button class='btn secondary' id='mailPrint'>Print</button></div></div>"+
      "<div class='panel mail-message'><div class='mail-subject'><h2>"+mailEsc(r.subject||detail&&detail.subject||"(no subject)")+"</h2><span>"+mailEsc(mailDate(r.created_at||detail&&detail.receivedAt))+"</span></div>"+
      "<div class='mail-headers'><b>From:</b> "+mailEsc(from)+"<br><b>To:</b> "+mailEsc(to)+(cc?"<br><b>Cc:</b> "+mailEsc(cc):"")+"<br><b>Message ID:</b> "+mailEsc(r.provider_message_id||"ERP record")+"<br><b>Thread:</b> "+mailEsc(r.thread_id||"—")+"</div>"+linked+
      "<div class='mail-body'>"+mailTextHtml(body)+"</div>"+
      (attachments.length?"<div class='mail-attachments'><b>Attachments</b>"+attachments.map(function(a){return "<span class='mail-attachment'>📎 "+mailEsc(a.name||"attachment")+" · "+mailEsc(a.type||"file")+"</span>"}).join("")+"</div>":"")+
      "</div>";
    document.getElementById("main").innerHTML="<div class='mail-shell'>"+head+(thread.length>1?"<div class='panel'><div class='head'><h3>Conversation · "+thread.length+" messages</h3></div>"+thread.map(function(x){return "<div class='mail-thread-item'><b>"+mailEsc(x.sender_email||x.recipient_email||"Email")+"</b><span>"+mailEsc(mailDate(x.created_at))+"</span><strong>"+mailEsc(x.subject||"")+"</strong><div>"+mailEsc(String(x.message||"").slice(0,300))+"</div></div>"}).join("")+"</div>":"")+"</div>";
    document.getElementById("mailBack").onclick=mailPage;
    document.getElementById("mailReply").onclick=function(){mailReply(r)};
    document.getElementById("mailForward").onclick=function(){mailForward(r,detail)};
    document.getElementById("mailArchive").onclick=function(){mailSetFolder(r,"archive")};
    document.getElementById("mailTrash").onclick=function(){mailSetFolder(r,"trash")};
    document.getElementById("mailPrint").onclick=function(){var w=window.open("","_blank");w.document.write("<pre style='white-space:pre-wrap;font-family:Arial'>"+mailEsc(body)+"</pre>");w.print();w.close()};
    if(document.getElementById("mailOpenCustomer"))document.getElementById("mailOpenCustomer").onclick=function(){window.__customerProfileId=r.customer_id;go("customer_profile")};
  }
  function mailTextHtml(s){return mailEsc(String(s||"")).replace(/\n/g,"<br>")}
  async function mailContacts(){
    var c=await api("/rest/v1/customers?business_id=eq."+encodeURIComponent(BIZ)+"&select=id,full_name,email,mobile&order=full_name.asc&limit=2000").catch(function(){return{data:[]}}),a=await api("/rest/v1/applications?business_id=eq."+encodeURIComponent(BIZ)+"&select=id,application_no,customer_id&order=created_at.desc&limit=1000").catch(function(){return{data:[]}});return{customers:c.data||[],applications:a.data||[]};
  }
  function mailOptions(a,label){
    return "<option value=''>"+label+"</option>"+a.map(function(x){return "<option value='"+mailEsc(x.id)+"'>"+mailEsc(x.full_name||x.application_no||x.email||x.id)+"</option>"}).join("");
  }
  async function mailCompose(seed){
    var ct=await mailContacts();
    var s=seed||{};
    var tpl=mailState.templates||[];
    var body="<form id='mailComposeForm' class='formgrid'><div class='field'><label>To *</label><input id='mailTo' type='text' required value='"+mailEsc(s.to||"")+"' placeholder='email@example.com, another@example.com'></div><div class='field'><label>Customer</label><select id='mailCustomer'>"+mailOptions(ct.customers,"Not linked")+"</select></div><div class='field'><label>Cc</label><input id='mailCc' type='text' value='"+mailEsc(s.cc||"")+"' placeholder='cc@example.com'></div><div class='field'><label>Bcc</label><input id='mailBcc' type='text' value='"+mailEsc(s.bcc||"")+"' placeholder='bcc@example.com'></div><div class='field'><label>Application</label><select id='mailApplication'>"+mailOptions(ct.applications,"Not linked")+"</select></div><div class='field'><label>Template</label><select id='mailTemplate'><option value=''>Choose template</option>"+tpl.map(function(x){return "<option value='"+mailEsc(x.id)+"'>"+mailEsc(x.name)+"</option>"}).join("")+"</select></div><div class='field span2'><label>Subject *</label><input id='mailSubject' required maxlength='200' value='"+mailEsc(s.subject||"")+"'></div><div class='field span2'><label>Message *</label><textarea id='mailBody' rows='12' required maxlength='100000'>"+mailEsc(s.body||"")+"</textarea></div><div class='field span2'><label>Attachments</label><input id='mailFiles' type='file' multiple accept='.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'><div class='muted mail-small'>Up to 10 files · provider limit applies</div></div><div class='span2' style='display:flex;justify-content:flex-end;gap:8px'><button type='button' class='btn secondary' id='mailDraft'>Save Draft</button><button type='button' class='btn secondary' id='mailCancel'>Cancel</button><button type='submit' class='btn'>Send Email</button></div></form>";
    openModal(seed&&seed.title||"Compose Email",body);
    document.getElementById("mailCancel").onclick=closeModal;
    document.getElementById("mailCustomer").onchange=function(){var c=ct.customers.find(function(x){return x.id===this.value}.bind(this));if(c){document.getElementById("mailTo").value=c.email||""}};
    document.getElementById("mailTemplate").onchange=function(){var t=tpl.find(function(x){return x.id===this.value}.bind(this));if(t){document.getElementById("mailSubject").value=t.subject_template||"";document.getElementById("mailBody").value=t.body_template||""}};
    document.getElementById("mailDraft").onclick=function(){mailSaveDraft()};
    document.getElementById("mailComposeForm").onsubmit=function(e){e.preventDefault();mailSend()};
    if(s.customer_id)document.getElementById("mailCustomer").value=s.customer_id;
    if(s.application_id)document.getElementById("mailApplication").value=s.application_id;
  }
  async function mailFiles(){
    var fs=Array.from(document.getElementById("mailFiles").files||[]);
    if(fs.length>10)throw Error("Maximum 10 attachments");
    return Promise.all(fs.map(function(f){return new Promise(function(resolve,reject){if(f.size>8*1024*1024){reject(Error(f.name+" is larger than 8 MB"));return}var r=new FileReader();r.onload=function(){resolve({filename:f.name,content_type:f.type||"application/octet-stream",data_base64:String(r.result).split(",")[1]||""})};r.onerror=reject;r.readAsDataURL(f)})}));
  }
  function splitEmails(v){return String(v||"").split(/[,;\s]+/).map(function(x){return x.trim()}).filter(Boolean)}
  async function mailSend(){
    var b=document.querySelector("#mailComposeForm button[type=submit]");if(b){b.disabled=true;b.textContent="Sending…"}
    try{
      var files=await mailFiles(),to=splitEmails(document.getElementById("mailTo").value),cc=splitEmails(document.getElementById("mailCc").value),bcc=splitEmails(document.getElementById("mailBcc").value),subject=document.getElementById("mailSubject").value.trim(),body=document.getElementById("mailBody").value,customer=document.getElementById("mailCustomer").value||null,application=document.getElementById("mailApplication").value||null;
      if(!to.length)throw Error("Enter at least one recipient");
      var r=await api("/api/email/send",{method:"POST",body:JSON.stringify({to:to.length===1?to[0]:to,cc:cc.length?cc:undefined,bcc:bcc.length?bcc:undefined,subject,body,attachments:files,customer_id:customer,application_id:application})});
      if(!r.data||r.data.ok!==true)throw Error(r.data&&r.data.message||"Email send failed");
      closeModal();toast("Email sent successfully");mailPage();
    }catch(e){toast("Email send failed: "+e.message,true);if(b){b.disabled=false;b.textContent="Send Email"}}
  }
  async function mailSaveDraft(){
    try{
      var to=splitEmails(document.getElementById("mailTo").value),cc=splitEmails(document.getElementById("mailCc").value),bcc=splitEmails(document.getElementById("mailBcc").value),p={business_id:BIZ,folder:"draft",draft_to:to,draft_cc:cc,draft_bcc:bcc,draft_subject:document.getElementById("mailSubject").value,draft_body:document.getElementById("mailBody").value,attachments:[],created_by:user.id,updated_at:new Date().toISOString()};
      await api("/rest/v1/mail_metadata",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(p)});closeModal();toast("Draft saved");mailPage();
    }catch(e){toast("Draft save failed: "+e.message,true)}
  }
  async function mailReply(r){
    if(!r.provider_message_id){mailCompose({to:r.sender_email||"",subject:"Re: "+(r.subject||""),customer_id:r.customer_id,application_id:r.related_type==="application"?r.related_id:null});return}
    var ct=await mailContacts(),body="<form id='mailReplyForm' class='formgrid'><div class='field span2'><label>To</label><input value='"+mailEsc(r.sender_email||"")+"' disabled></div><div class='field span2'><label>Message *</label><textarea id='mailReplyBody' rows='10' required></textarea></div><div class='field span2'><label>Attachments</label><input id='mailReplyFiles' type='file' multiple accept='.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'></div><div class='span2' style='display:flex;justify-content:flex-end;gap:8px'><button type='button' class='btn secondary' id='mailReplyCancel'>Cancel</button><button type='submit' class='btn'>Send Reply</button></div></form>";
    openModal("Reply",body);document.getElementById("mailReplyCancel").onclick=closeModal;document.getElementById("mailReplyForm").onsubmit=async function(e){e.preventDefault();var btn=e.submitter;btn.disabled=true;try{var files=Array.from(document.getElementById("mailReplyFiles").files||[]),att=await Promise.all(files.map(function(f){return new Promise(function(resolve,reject){var rr=new FileReader();rr.onload=function(){resolve({filename:f.name,content_type:f.type||"application/octet-stream",data_base64:String(rr.result).split(",")[1]})};rr.onerror=reject;rr.readAsDataURL(f)})}));await api("/api/email/reply",{method:"POST",body:JSON.stringify({message_id:r.provider_message_id,body:document.getElementById("mailReplyBody").value,attachments:att,customer_id:r.customer_id,application_id:r.related_type==="application"?r.related_id:null})});closeModal();toast("Reply sent");mailPage()}catch(x){toast("Reply failed: "+x.message,true);btn.disabled=false}}; 
  }
  function mailForward(r,detail){mailCompose({title:"Forward Email",subject:"Fwd: "+(r.subject||""),body:"\n\n---------- Forwarded message ----------\nFrom: "+(r.sender_email||"")+"\nSubject: "+(r.subject||"")+"\n\n"+String(detail&&detail.body||r.message||"" )})}
  async function mailSync(){
    var b=document.getElementById("mailSync");if(b){b.disabled=true;b.textContent="Syncing…"}try{var r=await api("/api/email/sync",{method:"POST"});if(!r.data||r.data.ok!==true)throw Error(r.data&&r.data.message||"Sync failed");toast("Mail synchronized");mailPage()}catch(e){toast("Mail sync failed: "+e.message,true)}finally{if(b){b.disabled=false;b.textContent="↻ Sync Now"}}
  }
  async function mailTemplateManager(){
    var tr=await api("/api/email/templates",{method:"GET"}),ts=(tr.data&&tr.data.templates)||[];
    var html="<div class='panel'><div class='head'><div><h3>Email Templates</h3><div class='muted'>Reusable customer communication templates</div></div><button class='btn' id='mailTemplateClose'>Close</button></div><div class='tablewrap'><table class='table'><thead><tr><th>Name</th><th>Key</th><th>Subject</th><th>Enabled</th></tr></thead><tbody>"+(ts.length?ts.map(function(t){return "<tr><td><b>"+mailEsc(t.name)+"</b></td><td>"+mailEsc(t.template_key)+"</td><td>"+mailEsc(t.subject_template)+"</td><td>"+(t.enabled?"Yes":"No")+"</td></tr>"}).join(""):"<tr><td colspan='4'>No templates</td></tr>")+"</tbody></table></div></div>";
    document.getElementById("main").innerHTML="<div class='mail-shell'>"+html+"</div>";document.getElementById("mailTemplateClose").onclick=mailPage;
  }
  window.mailPage=mailPage;
  window.__SMART_CSC_MAIL_READY__=true;
})();

(function(){var s=document.createElement("style");s.textContent=".mail-shell{width:100%}.mail-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.mail-top-actions{display:flex;gap:8px}.mail-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px;min-height:620px}.mail-sidebar{background:#fff;border:1px solid #dce8f3;border-radius:16px;padding:12px;box-shadow:0 8px 28px rgba(15,52,86,.06)}.mail-compose-side{width:100%;margin-bottom:10px}.mail-folder{width:100%;border:0;background:transparent;text-align:left;padding:11px 12px;border-radius:10px;display:flex;align-items:center;gap:10px;color:#24415f;font-weight:700;cursor:pointer}.mail-folder:hover,.mail-folder.active{background:#e9f4ff;color:#0b67d1}.mail-folder em{margin-left:auto;font-style:normal;font-size:11px}.mail-divider{height:1px;background:#e5edf5;margin:10px 4px}.mail-account{margin-top:18px;padding:10px;background:#f5f9fd;border-radius:10px;font-size:11px;display:grid;gap:4px}.mail-account span,.mail-account small{color:#6f8499;overflow-wrap:anywhere}.mail-main{min-width:0}.mail-toolbar{display:flex;gap:8px;margin-bottom:10px}.mail-toolbar input{flex:1}.mail-panel{padding:0;overflow:hidden}.mail-list-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #e7eef5}.mail-table td{vertical-align:middle}.mailrow{cursor:pointer}.mailrow:hover{background:#f7fbff}.mail-unread{background:#eef7ff}.mail-unread td{font-weight:700}.mail-iconbtn{border:0;background:transparent;cursor:pointer;font-size:17px;color:#50708d}.mail-date{white-space:nowrap;font-size:11px;color:#6f8499}.mail-preview{max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mail-small{font-size:10px}.mail-empty{text-align:center;padding:80px 20px}.mail-empty-icon{font-size:46px;opacity:.35}.mail-read-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.mail-read-actions{display:flex;gap:6px;flex-wrap:wrap}.mail-message{padding:20px}.mail-subject{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.mail-subject h2{margin:0 0 14px}.mail-subject span{font-size:11px;color:#72879a}.mail-headers{background:#f6f9fc;border-radius:10px;padding:12px;line-height:1.8;font-size:12px;color:#46637e}.mail-body{padding:22px 4px;line-height:1.75;white-space:normal;overflow-wrap:anywhere}.mail-linkbox{background:#eef9f5;border:1px solid #cbeadd;border-radius:10px;padding:10px;margin-top:10px}.mail-attachments{border-top:1px solid #e5edf5;padding-top:12px;display:flex;gap:8px;flex-wrap:wrap}.mail-attachment{background:#f4f7fa;border-radius:8px;padding:8px 10px;font-size:11px}.mail-thread-item{padding:12px 0;border-bottom:1px solid #e5edf5;display:grid;gap:4px}.mail-thread-item span{font-size:10px;color:#71869a}.mail-loading{text-align:center;padding:60px}.mail-top h2{margin:0 0 4px}@media(max-width:850px){.mail-layout{grid-template-columns:1fr}.mail-sidebar{display:flex;flex-wrap:wrap;gap:4px}.mail-compose-side{width:auto}.mail-account{display:none}.mail-divider{display:none}.mail-folder{width:auto;flex:1 1 120px}.mail-top{align-items:flex-start;flex-direction:column}.mail-top-actions{width:100%}.mail-top-actions .btn{flex:1}.mail-preview{max-width:180px}.mail-read-head{align-items:flex-start;flex-direction:column}.mail-toolbar{position:sticky;top:0;z-index:3}.mail-date{white-space:normal}.mail-table th:nth-child(6),.mail-table td:nth-child(6){display:none}}";document.head.appendChild(s)})();`;