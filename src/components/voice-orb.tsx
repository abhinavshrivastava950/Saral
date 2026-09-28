"use client";
import type * as React from "react";
export function VoiceOrb({state="idle",level=0,small=false}:{state?:string;level?:number;small?:boolean}){
  return <div className={`voice-orb ${small?"small":""} ${state}`} style={{"--voice-level":level} as React.CSSProperties} aria-hidden="true"><div className="orb-orbit one"/><div className="orb-orbit two"/><div className="orb-aura"/><div className="orb-shell"><div className="orb-latitude a"/><div className="orb-latitude b"/><div className="orb-latitude c"/><div className="orb-highlight"/><div className="orb-center"><span/><span/><span/><span/><span/></div></div><div className="orb-speck a"/><div className="orb-speck b"/><div className="orb-speck c"/></div>;
}
