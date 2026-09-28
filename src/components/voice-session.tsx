"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {CheckCheck} from "lucide-react";
import {api,post,type FilingView} from "./client-api";
import {PersistentVoiceCall} from "./persistent-voice-call";
import {draftChanges,type DraftChange,type VoiceLanguage} from "@/lib/voice-language";

type CallTarget={filingId:string;demo:boolean;label:string};
type FilingUpdate={filingId:string;view:FilingView;changes:DraftChange[]};
type VoiceSession={target:CallTarget|null;openCall:(target:CallTarget)=>void;endCall:()=>void;lastUpdate:FilingUpdate|null;processingId:string|null};
const VoiceSessionContext=createContext<VoiceSession|null>(null);
export function useVoiceSession(){const value=useContext(VoiceSessionContext);if(!value)throw new Error("VoiceSessionProvider is required");return value;}

/** Lives in the root layout. Changing pages never owns or destroys microphone/audio resources. */
export function VoiceSessionProvider({children}:{children:ReactNode}){
  const[target,setTarget]=useState<CallTarget|null>(null),[minimized,setMinimized]=useState(false),[language,setLanguage]=useState<VoiceLanguage>("hi"),[notice,setNotice]=useState("");
  const[lastUpdate,setLastUpdate]=useState<FilingUpdate|null>(null),[processingId,setProcessingId]=useState<string|null>(null);
  const targetRef=useRef(target);targetRef.current=target;const path=usePathname(),previousPath=useRef(path);
  useEffect(()=>{if(previousPath.current!==path&&targetRef.current)setMinimized(true);previousPath.current=path;},[path]);
  const endCall=useCallback(()=>{targetRef.current=null;setTarget(null);setNotice("");},[]);
  const openCall=useCallback((next:CallTarget)=>{
    if(targetRef.current){setMinimized(false);setNotice(targetRef.current.filingId===next.filingId?"":"This call stays linked to its original return. End it before starting a call for another return.");return;}
    targetRef.current=next;setTarget(next);setMinimized(false);setNotice("");setLanguage("hi");
  },[]);
  const greeting=useCallback(async(lang:VoiceLanguage)=>{
    const active=targetRef.current;if(!active)throw new Error("The call has ended.");
    const r=await post<{greeting:string}>(`filings/${active.filingId}/voice-context`,{language:lang,aiConsent:true});return r.greeting;
  },[]);
  const answer=useCallback(async(text:string,lang:VoiceLanguage)=>{
    const active=targetRef.current;if(!active)throw new Error("The call has ended.");const id=active.filingId;setProcessingId(id);
    try{
      for(let attempt=0;attempt<2;attempt++){
        // Re-read on every turn; another screen or tab may have saved a newer revision.
        const before=await api<FilingView>(`filings/${id}`);
        const response=await fetch(`/api/filings/${id}/chat`,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({text,aiConsent:true,revision:before.filing.revision,inputMode:"voice",voiceLanguage:lang})});
        const result=await response.json();
        if(response.status===409&&result.code==="revision_conflict"&&attempt===0)continue;
        if(!response.ok)throw new Error(result.error??"This answer could not be saved.");
        const view=result as FilingView;
        setLastUpdate({filingId:id,view,changes:view.voiceChanges??draftChanges(before.filing,view.filing)});
        return view.voiceReply??view.filing.conversation?.messages.at(-1)?.text??"Your draft is updated.";
      }
      throw new Error("The return changed in another tab. Please say the correction again.");
    }finally{setProcessingId(current=>current===id?null:current);}
  },[]);
  return <VoiceSessionContext.Provider value={{target,openCall,endCall,lastUpdate,processingId}}>{children}
    {target&&<PersistentVoiceCall key={target.filingId} filingId={target.filingId} targetLabel={target.label} demo={target.demo} language={language} onLanguageChange={setLanguage} minimized={minimized} onMinimize={()=>setMinimized(true)} onExpand={()=>setMinimized(false)} getGreeting={greeting} onAnswer={answer} onClose={endCall} notice={notice} latestChanges={lastUpdate?.filingId===target.filingId?lastUpdate.changes:[]}/>}
  </VoiceSessionContext.Provider>;
}
export function VoiceDraftNotice({filingId,revision}:{filingId:string;revision:number}){
  const{lastUpdate}=useVoiceSession();
  if(!lastUpdate||lastUpdate.filingId!==filingId||lastUpdate.view.filing.revision!==revision||!lastUpdate.changes.length)return null;
  return <section className="voice-draft-notice" role="status"><CheckCheck size={19}/><div><strong>Updated from your voice · आपकी बात से मसौदा अपडेट हुआ</strong><ul>{lastUpdate.changes.slice(0,4).map(change=><li key={change.key}><span>{change.label}</span><del>{change.before}</del><b>{change.after}</b></li>)}</ul><p>Saved automatically. Please review the latest summary before filing.</p></div></section>;
}
