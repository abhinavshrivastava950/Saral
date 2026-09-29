import {loadEnvFile} from 'node:process';
loadEnvFile('.env.local');
const model=process.env.GEMINI_KNOWLEDGE_MODEL||'gemini-3.1-flash-lite';
try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
    method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'content-type':'application/json'},
    body:JSON.stringify({model,store:false,input:'Using only this fact: an employer issues Form 16. Who issues Form 16?',generation_config:{max_output_tokens:80}}),
    signal:AbortSignal.timeout(30000)
  });
  const body=await response.json();
  const text=body.steps?.filter(x=>x.type==='model_output').flatMap(x=>x.content??[]).map(x=>x.text??'').join('').trim()||'';
  const connected=response.ok&&/employer/i.test(text);
  console.log(JSON.stringify({connected,status:response.status,model,responded:Boolean(text),errorCode:body.error?.status}));
  if(!connected)process.exitCode=1;
}catch(error){console.log(JSON.stringify({connected:false,type:error.name,networkCode:error.cause?.code}));process.exitCode=1;}
