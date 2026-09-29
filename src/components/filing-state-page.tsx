"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowRight,Check,Download,FileCheck2,IndianRupee,Loader2,ShieldCheck} from "lucide-react";
import {api,type FilingView,type Session} from "./client-api";

type Section="payment"|"status"|"acknowledgement";

export function FilingStatePage({id,section,session}:{id:string;section:Section;session:Session}){
  const[view,setView]=useState<FilingView|null>(null);
  const[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setView(null);
    setError("");
    api<FilingView>(`filings/${id}`).then(result=>{if(active)setView(result);}).catch(reason=>{if(active)setError((reason as Error).message);});
    return()=>{active=false;};
  },[id]);

  if(error)return <section className="card empty-state" role="alert"><h1>We couldn’t open this return.</h1><p>{error}</p><Link href="/filings" className="button secondary">My returns <ArrowRight size={16}/></Link></section>;
  if(!view)return <div className="card loading-panel" role="status"><Loader2 className="spin" size={18}/> Opening this return…</div>;

  const filing=view.filing;
  const demo=Boolean(filing.demo);
  const home=`/filings/${id}`;
  const phase=filing.demo?.phase;
  const demoSubmitted=phase==="submitted"||phase==="verified";
  const demoVerified=phase==="verified";

  if(section==="payment")return <div className="filing-state-page">
    <div className="page-heading"><div><span className="eyebrow">SERVICE FEE · सेवा शुल्क</span><h1>Clear before you continue.</h1><p>There is no charge in the interactive demo.</p></div></div>
    <section className="card payment-card"><IndianRupee size={36}/><h2>Proposed service fee</h2><div className="fee-large">₹{session.serviceFee}<span>For a future connected filing service</span></div><p>{demo?"This sample journey does not collect a payment, submit an official return or create a real refund.":"Payment is unavailable until an approved payment provider and official filing service are connected."}</p><div className="notice">No payment has been collected for this return. Never share a card number or OTP in the tax conversation.</div><Link className="button" href={home}>Back to my return <ArrowRight size={16}/></Link></section>
  </div>;

  if(section==="status"){
    const steps=demo?[
      {label:"Sample records connected",done:phase!=="created",detail:"Fictional source data"},
      {label:"Summary reviewed",done:Boolean(filing.reviewConfirmedAt),detail:"Your on-screen approval"},
      {label:"Demo submission simulated",done:demoSubmitted,detail:"Not sent to the Income Tax Department"},
      {label:"Demo verification completed",done:demoVerified,detail:"A demo receipt becomes available"},
    ]:[
      {label:"Return prepared",done:filing.status!=="draft",detail:"Review the complete summary"},
      {label:"Official submission confirmed",done:Boolean(filing.officialReference),detail:"Only after an official ERI response"},
      {label:"E-verification and acknowledgement",done:Boolean(filing.acknowledgement),detail:"Only after official confirmation"},
    ];
    return <div className="filing-state-page"><div className="page-heading"><div><span className="eyebrow">RETURN STATUS · रिटर्न की स्थिति</span><h1>{demo?"Your demo journey":"Your filing status"}</h1><p>{demo?"Every step below is a simulation using fictional records.":"Official filing is complete only after the filing service confirms it."}</p></div></div>
      <section className="card form-section"><span className="status-badge">{demo?`DEMO · ${phase?.replaceAll("_"," ")} · not filed`:filing.status.replaceAll("_"," ")}</span><div className="status-timeline">{steps.map(step=><div key={step.label}><span className={`timeline-icon ${step.done?"complete":""}`}>{step.done?<Check size={18}/>:<span/>}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div></div>)}</div>{demo&&<div className="notice">No official reference number or Income Tax Department acknowledgement exists for this demo.</div>}{filing.officialReference&&<p>Official reference: <strong>{filing.officialReference}</strong></p>}<div className="button-row"><Link className="button" href={home}>Open this return <ArrowRight size={16}/></Link>{(demoVerified||filing.acknowledgement)&&<Link className="button secondary" href={`${home}/acknowledgement`}>View acknowledgement</Link>}</div></section>
    </div>;
  }

  const demoReceipt=filing.demo?.acknowledgement;
  const officialReceipt=filing.acknowledgement;
  return <div className="filing-state-page"><div className="page-heading"><div><span className="eyebrow">ACKNOWLEDGEMENT · पावती</span><h1>{demo?"Your demo receipt":"Your acknowledgement"}</h1><p>{demo?"Fictional journey only. No real filing was made.":"We display an official acknowledgement only after the filing service confirms it."}</p></div></div>
    {demo&&demoVerified&&demoReceipt?<section className="card form-section state-receipt"><FileCheck2 size={32}/><span className="status-badge">DEMO RECEIPT · NOT FILED</span><h2>Demo journey complete</h2><dl><div><dt>Sample taxpayer</dt><dd>Aarav Sharma</dd></div><div><dt>Assessment year</dt><dd>2026–27</dd></div><div><dt>Demo reference</dt><dd>{demoReceipt.number}</dd></div></dl><div className="notice">NOT FILED WITH THE INCOME TAX DEPARTMENT</div><div className="button-row"><a className="button" href={`/api/filings/${id}/demo-receipt`}><Download size={16}/> Download demo receipt</a><Link className="button secondary" href={`${home}/status`}>View journey</Link></div></section>
    :!demo&&officialReceipt?<section className="card form-section state-receipt"><ShieldCheck size={32}/><span className="status-badge">OFFICIAL ACKNOWLEDGEMENT</span><h2>Confirmed by the filing service</h2><dl><div><dt>Acknowledgement number</dt><dd>{officialReceipt.number}</dd></div><div><dt>Received</dt><dd>{new Date(officialReceipt.receivedAt).toLocaleString("en-IN")}</dd></div></dl>{officialReceipt.url&&<a className="button" href={officialReceipt.url} target="_blank" rel="noreferrer">Open official acknowledgement <ArrowRight size={16}/></a>}</section>
    :<section className="card empty-state"><FileCheck2 size={34}/><h2>{demo?"No demo receipt yet":"No official acknowledgement yet"}</h2><p>{demo?"Finish the simulated review, submission and verification to create a clearly marked demo receipt.":"Check your return and complete the supported official filing and e-verification steps."}</p><Link className="button" href={home}>Continue this return <ArrowRight size={16}/></Link></section>}
  </div>;
}
