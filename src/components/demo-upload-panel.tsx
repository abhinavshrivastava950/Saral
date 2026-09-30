"use client";

import {useEffect,useRef,useState} from "react";
import {Check,ChevronDown,FileCheck2,FileUp,Loader2,ShieldCheck,Trash2} from "lucide-react";
import {labels,inr,type FieldName} from "@/lib/domain";
import {api,post,type FilingView} from "./client-api";

const form16Fields=new Set<FieldName>(["employerName","employerTan","annualSalary","salaryTds","employerNps","basicDa","eligible80C","eligible80D","professionalTax","hraExemption"]);

export function DemoUploadPanel({view,onChange,uploadFirst=false,onBusyChange}:{view:FilingView;onChange:(next:FilingView)=>void;uploadFirst?:boolean;onBusyChange?:(busy:boolean)=>void}){
  const panel=useRef<HTMLElement>(null);
  const[file,setFile]=useState<File|null>(null);
  const[consent,setConsent]=useState(false);
  const[selected,setSelected]=useState<FieldName[]>([]);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");
  const[replaceOpen,setReplaceOpen]=useState(false);
  const filing=view.filing,pending=filing.pending;
  const uploaded=filing.conversation?.connections.some(source=>source.kind==="employer"&&source.reference==="USER-UPLOAD");
  const reliable=pending?.fields.filter(field=>field.value!==null&&field.confidence!=="low"&&form16Fields.has(field.key))??[];
  useEffect(()=>{if(pending)setSelected(pending.fields.filter(field=>field.value!==null&&field.confidence==="high"&&form16Fields.has(field.key)).map(field=>field.key));},[pending]);
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);

  async function upload(){
    if(!file||!consent||busy)return;
    if(file.size===0||file.size>10*1024*1024){setError("Choose a PDF, PNG or JPG under 10 MB.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const body=new FormData();body.set("file",file);body.set("aiConsent","true");body.set("revision",String(filing.revision));body.set("retain","false");body.set("demoFictional","true");
      const next=await api<FilingView>(`filings/${filing.id}/upload`,{method:"POST",body});
      onChange(next);setSelected(next.filing.pending?.fields.filter(field=>field.value!==null&&field.confidence==="high"&&form16Fields.has(field.key)).map(field=>field.key)??[]);setFile(null);setConsent(false);
      setNotice("High-confidence fields are preselected. Review each one, deselect anything incorrect, then apply explicitly.");
    }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
  }

  async function confirm(){
    if(!pending||!selected.length||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const next=await post<FilingView>(`filings/${filing.id}/upload/confirm`,{revision:filing.revision,confirmed:true,selectedKeys:selected});
      onChange(next);setSelected([]);setReplaceOpen(false);setNotice("Your selected fields are saved. Continue with the next question below.");
    }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
  }

  async function reject(){
    if(!pending||busy)return;
    setBusy(true);setError("");setNotice("");
    try{const next=await post<FilingView>(`filings/${filing.id}/upload/reject`,{revision:filing.revision});onChange(next);setSelected([]);setNotice("The proposed extraction was discarded. The saved tax figures were not changed.");}
    catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
  }

  function toggle(key:FieldName){setSelected(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key]);}

  if(uploaded&&!pending&&!replaceOpen)return <section className="demo-upload-complete" aria-label="Reviewed Form 16"><span className="upload-success-icon"><FileCheck2 size={22}/></span><div><strong>Form 16 reviewed <span>दस्तावेज़ तैयार</span></strong><p>Selected fields saved. {filing.salary.annualSalary!==null&&<>Salary {inr(filing.salary.annualSalary)} · </>}No raw file retained.</p></div><button className="text-button" onClick={()=>setReplaceOpen(true)}>Replace document</button></section>;

  const content=<section ref={panel} className="demo-upload-panel" aria-label="Fictional Form 16 upload">
    <div className="demo-upload-heading"><span className="sim-label">{pending?"REVIEW EXTRACTED FIELDS":"FORM 16 · फ़ॉर्म 16"}</span><h2>{pending?"Check what we found":uploadFirst?"Upload a sample Form 16":"Try a fictional Form 16 upload"}</h2><p>{pending?"Check the values against your document. Only the selected fields will be saved.":"Choose a fictional PDF or image. AI reads it, you review the extracted values, and we ask only what’s missing."}</p>{!pending&&<div className="demo-sample-links"><span>Need a sample?</span><a className="demo-sample-link" href="/samples/form16-fictional-sample.png" download="form16-fictional-sample.png">Download sample image</a><a className="demo-sample-link" href="/samples/form16-fictional-sample.pdf" download="form16-fictional-sample.pdf">Download sample PDF</a></div>}</div>
    {!pending?<>
      <label className="demo-file-picker" htmlFor="demo-form16"><FileUp size={23}/><span>{file?file.name:"Choose a fictional PDF, PNG or JPG"}</span><small>Up to 10 MB · Sample data only</small></label>
      <input id="demo-form16" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={event=>setFile(event.target.files?.[0]??null)}/>
      <label className="demo-upload-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>I confirm this document contains fictional information and agree to send it to the AI service for extraction.</span></label>
      <button className="button demo-primary" disabled={!file||!consent||busy} onClick={upload}>{busy?<Loader2 className="spin" size={16}/>:<FileUp size={16}/>} Extract sample Form 16</button>
      {replaceOpen&&<button className="text-button" disabled={busy} onClick={()=>setReplaceOpen(false)}>Keep current document</button>}
    </>:<div className="demo-upload-review">
      <div className="demo-upload-review-head"><div><strong>Check the proposed details</strong><p>{pending.message}</p></div><span>{pending.fields.length} fields found</span></div>
      {pending.warnings.length>0&&<ul className="demo-upload-warnings">{pending.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
      <div className="demo-upload-fields">{pending.fields.map((field,index)=>{
        const canApply=field.value!==null&&field.confidence!=="low"&&form16Fields.has(field.key);
        return <label className={`demo-upload-field ${canApply?"":"uncertain"}`} key={`${field.key}-${index}`}><input type="checkbox" disabled={!canApply||busy} checked={selected.includes(field.key)} onChange={()=>toggle(field.key)}/><span><strong>{labels[field.key]}</strong><small>{field.evidence||"Source not established"}</small></span><span className="demo-upload-value">{field.value===null?"Missing":typeof field.value==="number"?inr(field.value):field.value}<small>{field.confidence} confidence{canApply?"":" · ask in chat"}</small></span></label>;
      })}</div>
      <div className="demo-upload-actions"><button className="text-button" disabled={!reliable.length||busy} onClick={()=>setSelected(reliable.map(field=>field.key))}>Select reliable fields</button><button className="button demo-primary" disabled={!selected.length||busy} onClick={confirm}>{busy?<Loader2 className="spin" size={16}/>:<Check size={16}/>} Apply {selected.length} selected</button><button className="button secondary" disabled={busy} onClick={reject}><Trash2 size={15}/> Discard</button></div>
      <p className="demo-upload-footnote">Unchecked fields leave existing demo values unchanged. Uncertain or unsupported values stay out of the draft. Review or discard this proposal before continuing chat or voice.</p>
    </div>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="demo-upload-notice" role="status"><ShieldCheck size={16}/>{notice}</p>}
  </section>;
  return !uploadFirst&&!pending&&!replaceOpen?<details className="demo-optional-upload"><summary><FileUp size={17}/> Try a document upload <ChevronDown size={16}/></summary>{content}</details>:content;
}
