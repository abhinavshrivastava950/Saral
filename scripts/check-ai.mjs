import {loadEnvFile} from 'node:process';
import OpenAI from 'openai';
loadEnvFile('.env.local');
try {
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:30000,maxRetries:0});
  const r=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-6-luna',store:false,reasoning:{effort:'none'},max_output_tokens:30,input:'Connection test only. Reply with OK. No taxpayer data is included.'});
  console.log(JSON.stringify({connected:true,model:r.model,responded:Boolean(r.output_text)}));
} catch(error) {
  console.log(JSON.stringify({connected:false,status:error.status??null,code:error.code??null,type:error.type??error.name}));
  process.exitCode=1;
}
