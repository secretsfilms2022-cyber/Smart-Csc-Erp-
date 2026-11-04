thz,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({amount:paid,transaction_reference:rd.id,notes:"Razorpay payment link synchronized",gateway:"razorpay",gateway_link_id:rd.id,gateway_payment_id:null})});
       if(!pr.ok)return new Response(JSON.stringify({message:"Razorpay paid status found, but ERP payment update failed"}),{status:502,headers:h});
     }else{
       const ar=await fetch(SB+"/rest/v1/applications?id=eq."+encodeURIComponent(local.application_id)+"&select=id,business_id,branch_id,customer_id",{headers:ah});
       const aa=(await ar.json().catch(()=>[]))[0];
       if(aa){
         const paymentNo="RZP-"+Date.now().toString().slice(-10);
         const pr=await fetch(SB+"/rest/v1/payments",{method:"POST",headers:{apikey:KEY,Authorization:authz,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({business_id:aa.business_id,branch_id:aa.branch_id||null,payment_no:paymentNo,customer_id:aa.customer_id,application_id:aa.id,amount:paid,payment_method:"razorpay",transaction_reference:rd.id,payment_type:"payment",notes:"Razorpay payment link synchronized",received_by:null,gateway:"razorpay",gateway_payment_id:null,gateway_order_id:null,gateway_link_id:rd.id})});
         if(!pr.ok)return new Response(JSON.stringify({message:"Razorpay paid status found, but ERP payment receipt could not be created"}),{status:502,headers:h});
         const created=await pr.json().catch(()=>[]);paymentId=created&&created[0]?.id||null;
       }
     }
     const ps=await fetch(SB+"/rest/v1/payments?application_id=eq."+encodeURIComponent(local.application_id)+"&business_id=eq."+encodeURIComponent(b.business_id)+"&select=amount",{headers:ah});
     const rows=await ps.json().catch(()=>[]);
     const totalPaid=rows.reduce((sum,x)=>sum+Number(x.amount||0),0);
     const appR=await fetch(SB+"/rest/v1/applications?id=eq."+encodeURIComponent(local.application_id)+"&select=id,service_fee",{headers:ah});
     const appRow=(await appR.json().catch(()=>[]))[0];
     if(appRow){
       const fee=Number(appRow.service_fee||0),balance=Math.max(0,fee-totalPaid),status=totalPaid<=0?"not_paid":balance<=0?"paid":"partially_paid";
       await fetch(SB+"/rest/v1/applications?id=eq."+encodeURIComponent(local.application_id),{method:"PATCH",headers:{apikey:KEY,Authorization:authz,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({amount_paid:totalPaid,balance:balance,payment_status:status,payment_method:"razorpay",updated_at:new Date().toISOString()})});
     }
   }
   return new Response(JSON.stringify({ok:true,message:rd.status==="paid"?"Payment confirmed and ERP receipt synchronized.":"Razorpay status synchronized.",link:{id:rd.id,status:rd.status,amount:Number(rd.amount||0)/100,amount_paid:paid,short_url:rd.short_url||local.short_url,payment_id:paymentId||null}}),{status:200,headers:h});
 }
 if(url.pathname==="/api/razorpay/create-link"&&req.method==="POST"){
   const authz=req.headers.get("Authorization")||"";
   if(!authz)return new Response(JSON.stringify({message:"No session"}),{status:401,headers:h});
   const key=(typeof RAZORPAY_KEY_ID!=="undefined"?RAZORPAY_KEY_ID:""), secret=(typeof RAZORPAY_KEY_SECRET!=="undefined"?RAZORPAY_KEY_SECRET:"");
   if(!key||!secret)return new Response(JSON.stringify({message:"Razorpay is connected in ChatGPT, but the ERP Worker still needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET configured as Cloudflare Worker secrets."}),{status:503,headers:h});
   const b=await req.json().catch(()=>({}));const amount=Number(b.amount||0);if(!b.application_id||amount<=0)return new Response(JSON.stringify({message:"application_id and a positive amount are required"}),{status:400,headers:h});
   const ah=new Headers({apikey:KEY,Authorization:authz});
   const ar=await fetch(SB+"/rest/v1/applications?id=eq."+encodeURIComponent(b.application_id)+"&select=id,application_no,business_id,customer_id,service_fee,amount_paid,balance",{headers:ah});
   const apps=await ar.json().catch(()=>[]);const a=apps&&apps[0];if(!a||String(a.business_id)!==String(b.business_id))return new Response(JSON.stringify({message:"Application not found or not accessible"}),{status:404,headers:h});
   const balance=Number(a.balance!=null?a.balance:Number(a.service_fee||0)-Number(a.amount_paid||0));if(amount>balance)return new Response(JSON.stringify({message:"Payment amount exceeds application balance of ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¹"+balance}),{status:400,headers:h});
   var customer=null;if(b.customer_id){const cr=await fetch(SB+"/rest/v1/customers?id=eq."+encodeURIComponent(b.customer_id)+"&select=full_name,mobile,email",{headers:ah});customer=(await cr.json().catch(()=>[]))[0]||null;}
   const reference=(a.application_no+"-"+Date.now()).slice(0,40);
   const payload={amount:Math.round(amount*100),currency:"INR",accept_partial:false,reference_id:reference,description:String(b.description||("Smart CSC payment for "+a.application_no)).slice(0,2048),customer:{name:customer?.full_name||"Smart CSC Customer",contact:customer?.mobile||undefined,email:customer?.email||undefined},notify:{sms:false,email:!!customer?.email},reminder_enable:true,notes:{application_id:String(a.id),business_id:String(a.business_id)}};
   const basic=btoa(key+":"+secret);
   const rr=await fetch("https://api.razorpay.com/v1/payment_links",{method:"POST",headers:{"Authorization":"Basic "+basic,"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const rd=await rr.json().catch(()=>({}));
   if(!rr.ok)return new Response(JSON.stringify({message:rd.error?.description||"Razorpay payment link creation failed",razorpay:rd}),{status:rr.status,headers:h});
   const ins=await fetch(SB+"/rest/v1/razorpay_payment_links",{method:"POST",headers:{apikey:KEY,Authorization:authz,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({business_id:a.business_id,application_id:a.id,customer_id:b.customer_id||a.customer_id||null,amount:amount,currency:"INR",reference_id:reference,razorpay_link_id:rd.id,short_url:rd.short_url,status:rd.status||"created",amount_paid:Number(rd.amount_paid||0)/100,expires_at:rd.expire_by?new Date(rd.expire_by*1000).toISOString():null,description:rd.description||null,metadata:{razorpay_amount:rd.amount,source:"erp"},created_by:null})});
   if(!ins.ok)return new Response(JSON.stringify({message:"Razorpay link was created, but ERP could not save the link record.",link:rd}),{status:502,headers:h});
   return new Response(JSON.stringify({link:{id:rd.id,short_url:rd.short_url,status:rd.status,amount:amount,reference_id:reference}}),{status:200,headers:h});
 }
 return null;
}(function(){var oldHandler=apiHandler;apiHandler=async function(req,url){if(url.pathname==="/api/invoice/pdf"&&req.method==="POST"){var auth=req.headers.get("Authorization")||"";if(!auth)return new Response("Unauthorized",{status:401});var b=await req.json().catch(function(){return{}}),id=String(b.invoice_id||""),html=String(b.html||"");if(!html)return new Response("Bad request",{status:400});var h=new Headers({apikey:KEY,Authorization:auth}),q=await fetch(SB+"/rest/v1/invoices?id=eq."+encodeURIComponent(id)+"&business_id=eq."+encodeURIComponent(BIZ)+"&select=id,invoice_no",{headers:h}),rows=await q.json().catch(function(){return[]});if(id&&(!q.ok||!rows[0]))return new Response("Invoice not found",{status:404});if(typeof BROWSER==="undefined"||!BROWSER.quickAction)return new Response("PDF engine not configured",{status:503});return await BROWSER.quickAction("pdf",{html:html,pdfOptions:{format:"a4",printBackground:true,preferCSSPageSize:true,margin:{top:"0mm",bottom:"0mm",left:"0mm",right:"0mm"}}})}return oldHandler(req,url)}})();
function repairUtf8Mojibake(v){var x=String(v||"");for(var n=0;n<8;n++){if(!/[ÃÂâð]/.test(x))break;var out="",buf="";for(var i=0;i<x.length;i++){var cc=x.charCodeAt(i);if(cc<=255){buf+=x[i]}else{if(buf){try{out+=new TextDecoder("utf-8").decode(Uint8Ar