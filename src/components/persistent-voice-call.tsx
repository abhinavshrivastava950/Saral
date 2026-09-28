"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,CheckCheck,Languages,Maximize2,Mic,MicOff,Minus,PhoneOff,ShieldCheck,Square,Volume2} from "lucide-react";
import {VoiceOrb} from "./voice-orb";
import type {DraftChange,VoiceLanguage} from "@/lib/voice-language";

type Stage="idle"|"connecting"|"listening"|"thinking"|"speaking"|"muted"|"error";
type Props={filingId:string;targetLabel:string;demo:boolean;language:VoiceLanguage;onLanguageChange:(language:VoiceLanguage)=>void;minimized:boolean;onMinimize:()=>void;onExpand:()=>void;onClose:()=>void;getGreeting:(language:VoiceLanguage)=>Promise<string>;onAnswer:(text:string,language:VoiceLanguage)=>Promise<string>;notice?:string;latestChanges:DraftChange[]};
export function PersistentVoiceCall(props:Props){
  const{filingId,targetLabel,demo,language,onLanguageChange,minimized,onMinimize,onExpand,notice,latestChanges}=props;
  const[stage,setStage]=useState<Stage>("idle"),[level,setLevel]=useState(0),[transcript,setTranscript]=useState(""),[spoken,setSpoken]=useState(""),[error,setError]=useState("");
  const dialog=useRef<HTMLElement|null>(null),active=useRef(false),paused=useRef(false),ctx=useRef<AudioContext|null>(null),stream=useRef<MediaStream|null>(null);
  const recorder=useRef<MediaRecorder|null>(null),playback=useRef<AudioBufferSourceNode|null>(null),inputAnalyser=useRef<AnalyserNode|null>(null),outputAnalyser=useRef<AnalyserNode|null>(null);
  const raf=useRef(0),timeout=useRef<ReturnType<typeof setTimeout>|null>(null),request=useRef<AbortController|null>(null),currentStage=useRef<Stage>("idle"),starting=useRef(false),generation=useRef(0),callbacks=useRef(props);
  callbacks.current=props;
  function transition(value:Stage){currentStage.current=value;setStage(value);}
  function isCurrent(token:number){return active.current&&!paused.current&&token===generation.current;}
  function setMic(enabled:boolean){stream.current?.getTracks().forEach(track=>{track.enabled=enabled;});}
  function cancelTurn(){generation.current++;request.current?.abort();if(timeout.current)clearTimeout(timeout.current);if(recorder.current?.state==="recording")recorder.current.stop();try{playback.current?.stop();}catch{}}
  function cleanup(){active.current=false;paused.current=false;starting.current=false;cancelTurn();cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());void ctx.current?.close();ctx.current=null;stream.current=null;}
  useEffect(()=>{window.addEventListener("pagehide",cleanup);return()=>{window.removeEventListener("pagehide",cleanup);cleanup();};},[]);
  // Minimizing releases only the modal UI, never the call's audio resources.
  useEffect(()=>{
    if(minimized)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();callbacks.current.onMinimize();}
      if(event.key==="Tab"){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), a[href]')??[]),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener("keydown",keydown);return()=>{document.removeEventListener("keydown",keydown);document.body.style.overflow=overflow;previous?.focus();};
  },[minimized]);
  function fail(message:string){cleanup();setLevel(0);transition("error");setError(message);}
  function end(){cleanup();callbacks.current.onClose();}
  function animate(){let last=0;const frame=(now:number)=>{if(!active.current)return;if(now-last>50){last=now;const a=currentStage.current==="speaking"?outputAnalyser.current:inputAnalyser.current;if(a&&!paused.current){const values=new Uint8Array(a.fftSize);a.getByteTimeDomainData(values);let square=0;for(const v of values)square+=((v-128)/128)**2;setLevel(Math.min(1,Math.sqrt(square/values.length)*5));}}raf.current=requestAnimationFrame(frame);};raf.current=requestAnimationFrame(frame);}
  async function speak(text:string){
    if(!active.current||!ctx.current||paused.current)return;const token=generation.current;transition("thinking");setMic(false);setSpoken(text);
    try{const abort=new AbortController();request.current=abort;
      const r=await fetch(`/api/filings/${filingId}/speech`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text.slice(0,2200),language:callbacks.current.language,aiConsent:true}),signal:abort.signal});
      if(!r.ok){const body=await r.json();throw new Error(body.error??"Voice playback is unavailable.");}const bytes=await r.arrayBuffer();if(!isCurrent(token)||!ctx.current)return;
      const buffer=await ctx.current.decodeAudioData(bytes);if(!isCurrent(token)||!ctx.current)return;const source=ctx.current.createBufferSource();source.buffer=buffer;source.connect(outputAnalyser.current!);outputAnalyser.current!.connect(ctx.current.destination);playback.current=source;
      source.onended=()=>{if(isCurrent(token))timeout.current=setTimeout(()=>{if(isCurrent(token))listen();},180);};transition("speaking");source.start();
    }catch(e){if(isCurrent(token))fail((e as Error).message);}
  }
  function listen(){
    if(!active.current||paused.current||!stream.current)return;const token=generation.current;setMic(true);transition("listening");
    const mime=["audio/webm","audio/mp4"].find(value=>MediaRecorder.isTypeSupported(value));const media=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined);recorder.current=media;
    const chunks:Blob[]=[];let speechSamples=0,lastSpeech=performance.now();const started=performance.now();
    media.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    media.onstop=()=>{
      if(timeout.current)clearTimeout(timeout.current);if(!isCurrent(token))return;
      if(speechSamples<3){timeout.current=setTimeout(()=>{if(isCurrent(token))listen();},250);return;}
      setMic(false);transition("thinking");void(async()=>{
        try{const form=new FormData();form.set("audio",new File(chunks,media.mimeType.includes("mp4")?"voice.mp4":"voice.webm",{type:media.mimeType}));form.set("aiConsent","true");form.set("language",callbacks.current.language);const abort=new AbortController();request.current=abort;
          const r=await fetch(`/api/filings/${filingId}/transcribe`,{method:"POST",body:form,signal:abort.signal});const body=await r.json();if(!r.ok)throw new Error(body.error??"Transcription failed.");
          if(!isCurrent(token))return;setTranscript(body.text);const reply=await callbacks.current.onAnswer(body.text,callbacks.current.language);if(isCurrent(token))await speak(reply);
        }catch(e){if(isCurrent(token))fail((e as Error).message);}
      })();
    };
    media.start();
    const detect=()=>{if(!isCurrent(token)||media.state!=="recording")return;const a=inputAnalyser.current!,values=new Uint8Array(a.fftSize);a.getByteTimeDomainData(values);let square=0;for(const v of values)square+=((v-128)/128)**2;const now=performance.now();if(Math.sqrt(square/values.length)>0.016){speechSamples++;lastSpeech=now;}const pause=callbacks.current.language==="en"?1400:1850;
      if((speechSamples>=3&&now-lastSpeech>pause&&now-started>1800)||now-started>45000){media.stop();return;}timeout.current=setTimeout(detect,100);
    };detect();
  }
  async function begin(){
    if(starting.current||active.current)return;starting.current=true;setError("");transition("connecting");
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){starting.current=false;transition("error");setError("Microphone recording is unavailable in this browser. You can continue in chat.");return;}
    const token=generation.current;
    try{ctx.current=new AudioContext();await ctx.current.resume();if(token!==generation.current||!ctx.current)return;active.current=true;paused.current=false;
      const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(!isCurrent(token)){mic.getTracks().forEach(track=>track.stop());return;}
      stream.current=mic;setMic(false);inputAnalyser.current=ctx.current.createAnalyser();inputAnalyser.current.fftSize=512;ctx.current.createMediaStreamSource(mic).connect(inputAnalyser.current);outputAnalyser.current=ctx.current.createAnalyser();outputAnalyser.current.fftSize=512;animate();
      const greeting=await callbacks.current.getGreeting(callbacks.current.language);if(isCurrent(token))await speak(greeting);
    }catch(e){if(token===generation.current)fail((e as Error).name==="NotAllowedError"?"Microphone permission was not granted. Allow it or continue in chat.":(e as Error).message||"Could not start audio.");}finally{starting.current=false;}
  }
  function togglePause(){if(!active.current)return;if(paused.current){paused.current=false;setError("");listen();return;}paused.current=true;cancelTurn();setMic(false);setLevel(0);transition("muted");}
  function interrupt(){if(stage==="speaking"){try{playback.current?.stop();}catch{}}else if(stage==="listening"&&recorder.current?.state==="recording")recorder.current.stop();}
  const titles:Record<Stage,string>={idle:"Let’s talk taxes.",connecting:"Connecting your voice…",listening:"I’m listening.",thinking:"Working on your answer…",speaking:"Here’s what I found.",muted:"Your microphone is paused.",error:"Let’s try that again."};
  const hindi:Record<Stage,string>={idle:"हिंदी में आराम से बात कीजिए।",connecting:"कॉल जुड़ रही है…",listening:"बोलिए, मैं सुन रहा हूँ।",thinking:"आपकी बात समझ रहा हूँ…",speaking:"आपका टैक्स साथी",muted:"माइक बंद है। आप साइट देख सकते हैं।",error:"दोबारा कोशिश करें या चैट में बताइए।"};
  if(minimized)return <section className="voice-dock" role="region" aria-label="Ongoing voice call"><button className={`dock-orb ${stage}`} onClick={onExpand} aria-label="Expand voice call"><VoiceOrb small state={stage} level={level}/></button><div className="dock-copy"><strong>{stage==="idle"?"Saral voice · तैयार":stage==="muted"?"Call paused · माइक बंद":stage==="error"?"Voice needs attention":`Saral · ${stage==="listening"?"Listening / सुन रहा हूँ":stage==="thinking"?"Working on your answer":stage==="speaking"?"Speaking / जवाब दे रहा हूँ":"Connecting"}`}</strong><span>{targetLabel}</span>{latestChanges.length>0&&<small><CheckCheck size={12}/> {latestChanges.length} draft detail{latestChanges.length>1?"s":""} updated</small>}<Link href={`/filings/${filingId}`}>Open this return <ArrowUpRight size={12}/></Link></div><div className="dock-controls"><button aria-label={stage==="muted"?"Resume microphone":"Pause microphone"} disabled={['idle','error','connecting'].includes(stage)} onClick={togglePause}>{stage==="muted"?<Mic size={17}/>:<MicOff size={17}/>}</button><button aria-label="Show full voice call" onClick={onExpand}><Maximize2 size={16}/></button><button className="dock-end" aria-label="End voice call" onClick={end}><PhoneOff size={19}/></button></div></section>;
  return <div className="call-backdrop"><section ref={dialog} className="call-window" role="dialog" aria-modal="true" aria-labelledby="call-title"><div className="call-top"><span><span className="call-dot"/> SARAL VOICE {demo&&<small>DEMO</small>}</span><div className="call-top-controls"><button aria-label="Minimize voice call" title="Keep talking while you browse" onClick={onMinimize}><Minus size={19}/></button><button aria-label="Close and end call" title="End call and turn off the microphone" onClick={end}><PhoneOff size={18}/></button></div></div>
    <div className="call-target">{targetLabel}</div><div className="call-orb-wrap"><VoiceOrb state={stage} level={level}/></div><div className="call-state">{hindi[stage]}</div><h2 id="call-title">{titles[stage]}</h2>
    <div className="call-language"><Languages size={15}/><label htmlFor="call-language">बातचीत की भाषा</label><select id="call-language" value={language} disabled={!['idle','error','muted'].includes(stage)} onChange={e=>onLanguageChange(e.target.value as VoiceLanguage)}><option value="hi">हिंदी</option><option value="en">English</option><option value="auto">Hindi + English / Auto</option></select></div>
    {notice&&<p className="call-error" role="status">{notice}</p>}{stage==="idle"&&<div className="call-permission"><ShieldCheck size={17}/><p>आपकी आवाज़ और जवाब OpenAI से प्रोसेस होंगे; GPT‑6 Luna आपकी बात समझेगा। यह AI की बनाई आवाज़ है। आपकी बताई जानकारी और सुधार मसौदे में अपने आप सेव होंगे। मंज़ूरी और दाखिल करना स्क्रीन पर ही होगा।<br/>This is an AI-generated voice, processed by OpenAI. Minimize to browse while talking. This call stays linked to the return above. {demo?"Use fictional information in this demo.":""}</p></div>}
    {transcript&&<div className="call-transcript"><span>YOU SAID · आपने कहा</span><p>{transcript}</p></div>}{spoken&&stage!=="idle"&&<div className="call-spoken" aria-live="polite">{spoken}</div>}{latestChanges.length>0&&<div className="call-saved"><CheckCheck size={15}/><span>Saved to this draft · बदलाव सेव हो गए</span></div>}{error&&<p className="call-error" role="alert">{error}</p>}
    <div className="call-controls">{stage==="idle"||stage==="error"?<button className="call-start" onClick={begin}><Mic size={19}/> {stage==="error"?"Reconnect voice · फिर जुड़ें":"Agree & start voice call"}</button>:<><button className="call-secondary" disabled={!['speaking','listening'].includes(stage)} onClick={interrupt} aria-label={stage==="speaking"?"Interrupt and speak":"Finish speaking"}>{stage==="speaking"?<Mic size={22}/>:<Square size={18}/>}</button><button className="call-secondary" aria-label={stage==="muted"?"Resume microphone":"Pause microphone"} disabled={stage==="connecting"} onClick={togglePause}>{stage==="muted"?<Mic size={22}/>:<MicOff size={22}/>}</button><button className="call-end" aria-label="End voice call" onClick={end}><PhoneOff size={24}/></button><span>{stage==="muted"?"Paused — browsing won’t restart your microphone.":"थोड़ा रुकें, जवाब अपने आप भेज दिया जाएगा।"}</span></>}</div>
    <button className="call-browse" onClick={onMinimize}>Keep call open & explore the site <ArrowUpRight size={15}/></button><div className="call-provider"><Volume2 size={13}/> OpenAI voice <i/> GPT‑6 Luna reasoning</div>
  </section></div>;
}
