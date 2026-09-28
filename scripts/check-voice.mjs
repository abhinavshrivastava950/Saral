import {loadEnvFile} from 'node:process';
import OpenAI from 'openai';
loadEnvFile('.env.local');
try{
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:60000,maxRetries:0});
  const speech=await client.audio.speech.create({model:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',voice:process.env.OPENAI_TTS_VOICE||'marin',input:'Namaste. This is the Saral voice demo.',response_format:'wav'});
  const audio=await speech.arrayBuffer();
  const transcript=await client.audio.transcriptions.create({model:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe',file:new File([audio],'demo.wav',{type:'audio/wav'}),language:'en'});
  console.log(JSON.stringify({provider:'openai',audioPresent:audio.byteLength>44,transcript:transcript.text}));
}catch(error){console.log(JSON.stringify({ok:false,status:error.status??null,code:error.code??null}));process.exitCode=1;}
