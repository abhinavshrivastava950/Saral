import {loadEnvFile} from 'node:process';
loadEnvFile('.env.local');
try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(30000)});
  const body=await response.json();
  console.log(JSON.stringify({connected:response.ok,status:response.status,errorCode:body.error?.status,models:response.ok?body.models?.map(x=>x.name).filter(x=>/tts|flash|transcribe/.test(x)).slice(0,25):undefined}));
  if(!response.ok)process.exitCode=1;
}catch(error){console.log(JSON.stringify({connected:false,type:error.name,networkCode:error.cause?.code}));process.exitCode=1;}
