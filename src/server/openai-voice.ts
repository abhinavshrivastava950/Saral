import "server-only";
import OpenAI from "openai";
import {AppError} from "./errors";
import {maskSensitive} from "@/lib/chat";
import type {VoiceLanguage} from "@/lib/voice-language";

export const openaiVoiceReady=()=>Boolean(process.env.OPENAI_API_KEY);
function client(){
  if(!openaiVoiceReady())throw new AppError(503,"openai_voice_not_configured","OpenAI voice is not configured. You can continue by typing.");
  return new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:60000,maxRetries:1});
}
function voiceError(error:unknown):never{
  if(error instanceof AppError)throw error;
  const status=(error as {status?:number}).status;
  throw new AppError(503,status===429?"openai_voice_limit":"openai_voice_unavailable",status===429?"OpenAI voice is at its usage or billing limit. You can continue in chat.":"OpenAI could not complete the voice request. Your saved return is unchanged; please retry or continue in chat.");
}
export async function transcribeOpenAI(file:File,language:VoiceLanguage="auto"){
  try{
    const r=await client().audio.transcriptions.create({model:process.env.OPENAI_TRANSCRIBE_MODEL||"gpt-4o-mini-transcribe",file,response_format:"json",...(language==="auto"?{}:{language}),
      prompt:language==="hi"?"यह भारतीय आयकर की बातचीत है। हिंदी को देवनागरी में लिखें। FD, RD, TDS, NPS, PAN। सालाना ब्याज, हजार, लाख, रुपये, पैसे। पूरी राशि, नकार और सुधार सही लिखें; जैसे अठारह नहीं, बाईस हजार पांच सौ। अनुवाद न करें।":"Indian income-tax conversation in English, Hindi or Hinglish. Preserve all amounts, lakh/thousand units, decimals, negations and corrections. FD, RD, TDS, NPS. Transcribe, do not translate or answer.",
    });
    const text=r.text.trim();if(!text||text.length>6000)throw new AppError(422,"no_speech","I couldn’t hear a clear answer. Please try again or type it.");return text;
  }catch(error){return voiceError(error);}
}
export async function speakOpenAI(text:string,language:VoiceLanguage="auto"):Promise<{bytes:Uint8Array;mime:string}>{
  try{
    const r=await client().audio.speech.create({model:process.env.OPENAI_TTS_MODEL||"gpt-4o-mini-tts",voice:process.env.OPENAI_TTS_VOICE||"marin",input:maskSensitive(text),response_format:"wav",
      instructions:language==="hi"?"Speak fluent, natural Hindi with warm Indian pronunciation and a calm conversational pace. Read the supplied Hindi exactly. Pronounce rupee amounts, lakh/thousand units and familiar English banking terms clearly. Do not translate, invent words or add commentary.":"Speak warmly and clearly as an Indian tax companion. Read the supplied text exactly, with clear Hindi or Indian English pronunciation, accurate amounts and a natural conversational pace. Do not add commentary.",
    });
    const reader=r.body?.getReader();if(!reader)throw new AppError(502,"speech_missing","OpenAI returned no playable speech.");
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>18*1024*1024){await reader.cancel();throw new AppError(502,"speech_output_limit","The voice response exceeded the supported length.");}chunks.push(part.value);}
    if(!size)throw new AppError(502,"speech_missing","OpenAI returned an empty audio response.");
    return {bytes:Buffer.concat(chunks),mime:"audio/wav"};
  }catch(error){return voiceError(error);}
}
