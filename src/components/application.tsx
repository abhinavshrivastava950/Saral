"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {ArrowUpRight,BookOpen,FileCheck2,FileText,Languages,Link2,LockKeyhole,Menu,MessageCircle,Plus,ShieldCheck,UserRound,X} from "lucide-react";
import {api,post,type Session} from "./client-api";
import {ChatInterface,ConnectionsPage} from "./chat-interface";
import {DemoExperience} from "./demo-experience";
import {AdminPage,DocumentsPage,FilingsPage,GuidePage,Login,PrivacyPage} from "./workspace-pages";
export function Brand(){return <Link href="/" className="brand" aria-label="Saral home"><span className="brand-mark"><span/><span/><span/></span><span>saral<span className="brand-dot">.</span></span><small>सरल</small></Link>;}
export function Application(){
  const path=usePathname();const[menu,setMenu]=useState(false),[session,setSession]=useState<Session|null>(null),[error,setError]=useState("");
  async function refresh(){try{setSession(await api<Session>("session"));setError("");}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void refresh();},[]);useEffect(()=>{setMenu(false);},[path]);
  let content:React.ReactNode;
  const filingId=/^\/filings\/([a-f0-9-]+)(?:\/(?:payment|status|acknowledgement))?$/.exec(path)?.[1];
  const chatRoute=["/","/filings/new","/profile","/welcome"].includes(path)||Boolean(filingId);
  if(!session)content=<section className="card loading-panel">{error||"Opening Saral · आपका स्वागत है…"}{error&&<button className="button" onClick={refresh}>Try again</button>}</section>;
  else if(chatRoute)content=session.mode==="local"?<DemoExperience id={filingId} session={session} onSessionChange={refresh}/>:<ChatInterface id={filingId} session={session} onSessionChange={refresh}/>;
  else if(path==="/login")content=<Login session={session} onSignedIn={refresh}/>;
  else if(path==="/filings")content=<FilingsPage session={session}/>;
  else if(path==="/documents")content=<DocumentsPage session={session}/>;
  else if(path==="/connections")content=<ConnectionsPage/>;
  else if(path==="/guide")content=<GuidePage/>;
  else if(path==="/privacy")content=<PrivacyPage/>;
  else if(path==="/admin")content=<AdminPage session={session}/>;
  else content=<section className="card empty-state"><h1>Page not found.</h1><Link href="/" className="button">Back to my conversation</Link></section>;
  return <div className={`app-shell ${chatRoute?"chat-app":""} ${session?.mode==="local"?"experience-app":""}`}><a href="#main-content" className="skip-link">Skip to conversation</a>
    <aside className={`sidebar ${menu?"open":""}`}><Brand/><button className="sidebar-close icon-button" aria-label="Close navigation" onClick={()=>setMenu(false)}><X size={21}/></button><Link className="new-chat-button" href="/filings/new"><Plus size={18}/> New conversation <span>नई बातचीत</span></Link><div className="workspace-label">YOUR SPACE · आपका साथ</div><nav aria-label="Main navigation">{[
      ["/","Tax companion · टैक्स साथी",MessageCircle],["/filings","My returns · मेरे रिटर्न",FileCheck2],["/documents","My records · मेरे रिकॉर्ड",FileText],["/connections","Connections · कनेक्शन",Link2],["/guide","Help & guide · सहायता",BookOpen],
    ].map(([href,label,Icon])=>{const I=Icon as typeof MessageCircle;return <Link className={`nav-link ${(path===href||(href==="/"&&chatRoute))?"active":""}`} key={href as string} href={href as string}><I size={18}/>{label as string}</Link>;})}</nav><div className="sidebar-bottom"><div className="sidebar-help"><MessageCircle className="help-icon" size={23}/><strong>बातों-बातों में, ITR तैयार।</strong><p>Your records do the work.<br/>You only fill the gaps.</p><Link href="/guide">How it works <ArrowUpRight size={15}/></Link></div><div className="sidebar-trust"><ShieldCheck size={19}/><div>You stay in control<small>Nothing filed without approval.</small></div></div><Link href="/privacy" className="about-link">Privacy & consent <ArrowUpRight size={13}/></Link>{session?.user?.admin&&<Link href="/admin" className="about-link">Service monitoring</Link>}</div></aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><span className="topbar-title">आपका टैक्स साथी <span>Your personal tax companion</span></span></div><div className="topbar-actions"><span className="language-label"><Languages size={17}/> English + हिंदी</span><span className="topbar-divider"/>{session?.user?<button className="profile-avatar" title="Sign out of the private workspace" aria-label="Sign out" onClick={async()=>{await post("auth/logout",{});window.location.assign("/");}}><UserRound size={19}/></button>:<Link className="header-signin" href="/login">Sign in <LockKeyhole size={14}/></Link>}</div></header>
    {session?.mode==="local"&&<div className="environment-banner"><span>INTERACTIVE DEMO</span> Simulated records & acknowledgement · No real tax filing or payment.</div>}
    <main id="main-content" className="main-content">{content}</main><footer className="footer"><span>For central, state & PSU employees · आपकी सेवा में।</span><span>Independent service · Not a government portal · <Link href="/privacy">Privacy</Link></span></footer></div>
  </div>;
}
