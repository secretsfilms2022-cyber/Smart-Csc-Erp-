dels[mi];
    let gr=null;
    for(let attempt=0;attempt<1;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(function(){controller.abort()},18000);
      try{
        gr=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
          method:"POST",
          headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
          body:JSON.stringify({
            system_instruction:{parts:[{text:system}]},
            contents:[{role:"user",parts:[{text:prompt}]}],
            generationConfig:{maxOutputTokens:1200}
          }),
          signal:controller.signal
        });
        gd=await gr.json().catch(()=>({}));
      }catch(ex){
        gd={error:{message:ex&&ex.name==="AbortError"?"Gemini provider timeout":String(ex&&ex.message||ex)}};
        gr=null;
      }finally{clearTimeout(timer)}
      lastProviderStatus=gr?gr.status:504;
      lastProviderMessage=(gd.error&&gd.error.message)||"";
      if(gr&&gr.ok)break;
      if(gr&&!(gr.status===429||gr.status===500||gr.status===502||gr.status===503||gr.status===504))break;
      if(attempt===0)await new Promise(function(resolve){setTimeout(resolve,350)});
    }
    if(gr&&gr.ok){
      const answer=(gd.candidates||[]).flatMap(function(c){return (c.content&&c.content.parts)||[]}).map(function(p){return p.text||""}).join("\n").trim();
      if(answer)return new Response(JSON.stringify({ok:true,answer:answer,model:gd.modelVersion||model,context_window_days:30}),{status:200,headers:h});
    }
  }
  return new Response(JSON.stringify({
    message:lastProviderMessage||"Gemini is temporarily unavailable. Please retry in a moment.",
    provider_status:lastProviderStatus,
    models_tried:geminiModels
  }),{status:503,headers:h});

 }

 if(url.pathname==="/api/auth/login"&&req.method==="POST"){const b=await req.json().catch(()=>({}));const r=await fetch(SB+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify({email:b.email,password:b.password})});return new Response(await r.text(),{status:r.status,headers:h})}
 if(url.pathname==="/api/auth/signup"&&req.method==="POST"){const b=await req.json().catch(()=>({}));const r=await fetch(SB+"/auth/v1/signup",{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify({email:b.email,password:b.password})});return new Response(await r.text(),{status:r.status,headers:h})}
 if(url.pathname==="/api/auth/refresh"&&req.method==="POST"){const b=await req.json().catch(()=>({}));const r=await fetch(SB+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:b.refresh_token})});return new Response(await r.text(),{status:r.status,headers:h})}
 if(url.pathname==="/api/auth/user"&&req.method==="GET"){const a=req.headers.get("Authorization")||"";if(!a)return new Response(JSON.stringify({msg:"No session"}),{status:401,headers:h});const r=await fetch(SB+"/auth/v1/user",{headers:{apikey:KEY,Authorization:a}});return new Response(await r.text(),{status:r.status,headers:h})}
 if(url.pathname==="/api/customer-document-file"&&req.method==="GET"){
  const authz=req.headers.get("Authorization")||"";
  if(!authz)return new Response(JSON.stringify({message:"No session"}),{status:401,headers:h});
  const id=url.searchParams.get("id")||"";
  const mode=url.searchParams.get("mode")==="download"?"download":"preview";
  if(!id)return new Response(JSON.stringify({message:"Document id is required"}),{status:400,headers:h});
  const ah=new Headers({apikey:KEY,Authorization:authz});
  const dr=await fetch(SB+"/rest/v1/customer_documents?id=eq."+encodeURIComponent(id)+"&select=id,business_id,file_name,storage_path&limit=1",{headers:ah});
  const docs=await dr.json().catch(()=>[]);
  const d=docs&&docs[0];
  if(!dr.ok||!d||!d.storage_path)return new Response(JSON.stringify({message:"Document not found or not accessible"}),{status:dr.status===401?401:404,headers:h});
  const objectPath=d.storage_path.split("/").map(encodeURIComponent).join("/");
  const sr=await fetch(SB+"/storage/v1/object/authenticated/customer-documents/"+objectPath,{headers:ah});
  if(!sr.ok)return new Response(JSON.stringify({message:"Document storage access failed",status:sr.status}),{status:sr.status,headers:h});
  const rh=new Headers();
  rh.set("Content-Type",sr.headers.get("Content-Type")||"application/octet-stream");
  rh.set("Cache-Control","private, no-store");
  rh.set("X-File-Name",d.file_name||"document");
  rh.set("Content-Disposition",mode==="download"?"attachment":"inline");
  return new Response(sr.body,{status:200,headers:rh});
 } if(url.pathname.startsWith("/api/rest/")&&["GET","POST","PATCH","PUT","DELETE","HEAD"].includes(req.method)){const a=req.headers.get("Authorization")||"";if(!a)return new Response(JSON.stringify({msg:"No session"}),{status:401,headers:h});const hd=new Headers(req.headers);hd.set("apikey",KEY);hd.set("Authorization",a);hd.delete("host");hd.delete("content-length");const r=await fetch(SB+url.pathname.slice(4)+url.search,{method:req.method,headers:hd,body:["GET","HEAD"].includes(req.method)?undefined:req.body});return new Response(r.body,{status:r.status,headers:r.headers})}
 if(url.pathname==="/api/razorpay/sync-link"&&req.method==="POST"){
   const authz=req.headers.get("Authorization")||"";
   if(!authz)return new Response(JSON.stringify({message:"No session"}),{status:401,headers:h});
   const key=(typeof RAZORPAY_KEY_ID!=="undefined"?RAZORPAY_KEY_ID:""), secret=(typeof RAZORPAY_KEY_SECRET!=="undefined"?RAZORPAY_KEY_SECRET:"");
   if(!key||!secret)return new Response(JSON.stringify({message:"Razorpay credentials are not configured on this Worker."}),{status:503,headers:h});
   const b=await req.json().catch(()=>({})); if(!b.razorpay_link_id||!b.business_id)return new Response(JSON.stringify({message:"razorpay_link_id and business_id are required"}),{status:400,headers:h});
   const ah=new Headers({apikey:KEY,Authorization:authz});
   const lr=await fetch(SB+"/rest/v1/razorpay_payment_links?razorpay_link_id=eq."+encodeURIComponent(b.razorpay_link_id)+"&business_id=eq."+encodeURIComponent(b.business_id)+"&select=*",{headers:ah});
   const locals=await lr.json().catch(()=>[]); const local=locals&&locals[0];
   if(!local)return new Response(JSON.stringify({message:"ERP payment link record not found"}),{status:404,headers:h});
   const basic=btoa(key+":"+secret);
   const rr=await fetch("https://api.razorpay.com/v1/payment_links/"+encodeURIComponent(b.razorpay_link_id),{headers:{Authorization:"Basic "+basic}});
   const rd=await rr.json().catch(()=>({}));
   if(!rr.ok)return new Response(JSON.stringify({message:rd.error?.description||"Unable to read Razorpay payment link",razorpay:rd}),{status:rr.status,headers:h});
   const paid=Number(rd.amount_paid||0)/100;
   const upd=await fetch(SB+"/rest/v1/razorpay_payment_links?id=eq."+encodeURIComponent(local.id),{method:"PATCH",headers:{apikey:KEY,Authorization:authz,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({status:rd.status||local.status,amount_paid:paid,expires_at:rd.expire_by?new Date(rd.expire_by*1000).toISOString():local.expires_at,updated_at:new Date().toISOString()})});
   if(!upd.ok)return new Response(JSON.stringify({message:"Razorpay status read succeeded but ERP link update failed"}),{status:502,headers:h});

   if(paid>0&&local.application_id){
     const existingR=await fetch(SB+"/rest/v1/payments?gateway_link_id=eq."+encodeURIComponent(b.razorpay_link_id)+"&business_id=eq."+encodeURIComponent(b.business_id)+"&select=id,amount&limit=1",{headers:ah});
     const existing=(await existingR.json().catch(()=>[]))[0];
     var paymentId=existing?.id||null;
     if(existing){
       const pr=await fetch(SB+"/rest/v1/payments?id=eq."+encodeURIComponent(existing.id),{method:"PATCH",headers:{apikey:KEY,Authorization:au