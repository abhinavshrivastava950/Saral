import type {Page} from "@playwright/test";
export async function installVoiceMocks(page:Page){
  await page.addInitScript(()=>{
    const w=window as typeof window&{voiceStops:number;audioCloses:number;micRequests:number;voiceEnabled:boolean;voiceSignalUntil:number};
    w.voiceStops=0;w.audioCloses=0;w.micRequests=0;w.voiceEnabled=false;w.voiceSignalUntil=0;
    const track={get enabled(){return w.voiceEnabled;},set enabled(value:boolean){w.voiceEnabled=value;},stop:()=>{w.voiceStops++;w.voiceEnabled=false;}};
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:async()=>{w.micRequests++;return {getTracks:()=>[track]};}}});
    class FakeAudioContext{
      destination={};resume(){return Promise.resolve();}close(){w.audioCloses++;return Promise.resolve();}
      createAnalyser(){return {fftSize:512,getByteTimeDomainData:(buffer:Uint8Array)=>buffer.fill(w.voiceEnabled&&performance.now()<w.voiceSignalUntil?148:128),connect:()=>{}};}
      createMediaStreamSource(){return {connect:()=>{}};}decodeAudioData(){return Promise.resolve({});}
      createBufferSource(){return {buffer:null,onended:null as (()=>void)|null,connect:()=>{},start(){setTimeout(()=>this.onended?.(),20);},stop(){this.onended?.();}};}
    }
    class FakeRecorder{
      static isTypeSupported(){return true;}state="inactive";mimeType="audio/webm";onstop:(()=>void)|null=null;ondataavailable:((event:{data:Blob})=>void)|null=null;
      start(){this.state="recording";}stop(){this.state="inactive";this.ondataavailable?.({data:new Blob(["fictional-audio"],{type:"audio/webm"})});this.onstop?.();}
    }
    Object.defineProperty(window,"AudioContext",{configurable:true,value:FakeAudioContext});Object.defineProperty(window,"MediaRecorder",{configurable:true,value:FakeRecorder});
  });
  await page.route("**/api/filings/*/speech",route=>route.fulfill({status:200,contentType:"audio/wav",body:Buffer.from("mock-audio")}));
}
