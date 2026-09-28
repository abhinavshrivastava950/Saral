const base='http://127.0.0.1:3000';let cookie='',id;
async function call(path,body,method='POST'){
  const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const set=r.headers.getSetCookie();if(set.length)cookie=set.map(x=>x.split(';')[0]).join('; ');const data=await r.json();
  if(!r.ok){console.log(JSON.stringify({step:path.split('/').at(-1),status:r.status,code:data.code}));throw new Error('Check failed');}return data;
}
try{
 let v=await call('demo/start',{scenario:'missing-interest',consent:true});id=v.filing.id;
 v=await call(`filings/${id}/demo-fetch`,{confirmed:true,revision:v.filing.revision});
 v=await call(`filings/${id}/chat`,{text:'My annual FD interest was 18000 rupees, according to the fictional bank interest statement.',aiConsent:true,revision:v.filing.revision});
 console.log(JSON.stringify({step:'luna_interpretation',correctAmount:v.filing.salary.depositInterest===18000,readyForReview:v.chatCanReview}));
 if(v.filing.salary.depositInterest!==18000||!v.chatCanReview)throw new Error('Interpretation check failed');
 const salary=JSON.stringify(v.filing.salary);
 v=await call(`filings/${id}/chat`,{text:'Why do you compare the old and new tax regimes?',aiConsent:true,revision:v.filing.revision});
 console.log(JSON.stringify({step:'gemini_knowledge_luna_response',answered:Boolean(v.filing.conversation.messages.at(-1).text),financialDataUnchanged:salary===JSON.stringify(v.filing.salary)}));
}catch(e){console.log(JSON.stringify({ok:false,type:e.name,networkCode:e.cause?.code}));process.exitCode=1;}
finally{if(id)try{await call(`filings/${id}`,undefined,'DELETE');}catch{}}
