import {test,expect} from "@playwright/test";
import {mkdir} from "node:fs/promises";
const origin={Origin:"http://127.0.0.1:3000"};

test("motion demo is responsive, readable and has no tax-entry forms",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await expect(page.getByRole("heading",{name:/Less paperwork/})).toBeVisible();
  expect(await page.locator('input[type="number"],input[type="file"]').count()).toBe(0);
  await mkdir("artifacts",{recursive:true});await page.screenshot({path:"artifacts/saral-demo-desktop.png",fullPage:true,animations:"disabled"});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"artifacts/saral-demo-mobile.png",fullPage:true,animations:"disabled"});
  await page.getByRole("button",{name:"Toggle navigation"}).click();await page.getByRole("button",{name:"Close navigation"}).click();
  await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator('.orb-shell').first().evaluate(el=>getComputedStyle(el).animationName)).toBe("none");expect(errors).toEqual([]);
});

test("upload-first demo waits for a fictional Form 16 and explicit AI consent",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("button",{name:/Upload sample Form 16/})).toHaveClass(/selected/);
  await page.getByRole("button",{name:/Experience the demo/}).click();
  await expect(page.getByRole("heading",{name:"Upload a sample Form 16"})).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];
  const state=await (await page.request.get(`/api/filings/${id}`)).json();
  expect(state.filing.salary.annualSalary).toBeNull();
  expect(state.filing.salary.depositInterest).toBeNull();
  await expect(page.getByRole("link",{name:"Download sample image"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Download sample PDF"})).toBeVisible();
  expect((await page.request.get("/samples/form16-fictional-sample.pdf")).ok()).toBe(true);
  await page.locator("#demo-form16").setInputFiles("public/samples/form16-fictional-sample.png");
  await expect(page.getByRole("button",{name:"Extract sample Form 16"})).toBeDisabled();
  await page.getByLabel(/I confirm this document contains fictional information/).check();
  await expect(page.getByRole("button",{name:"Extract sample Form 16"})).toBeEnabled();
});

test("full demo reaches an explicitly simulated receipt without an ERI",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:/Everything connected/}).click();await page.getByRole("button",{name:/Experience the demo/}).click();
  await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];
  await expect(page.getByRole("button",{name:/Approve summary/})).toBeDisabled();
  await page.getByRole("button",{name:"Read the prepared details"}).click();await page.getByRole("button",{name:/Approve summary/}).click();
  await page.getByRole("button",{name:"Simulate filing my ITR"}).click();await page.getByRole("button",{name:"Complete demo verification"}).click();
  await expect(page.getByText("DEMO JOURNEY COMPLETE · डेमो पूरा हुआ")).toBeVisible();
  await expect(page.getByText("NOT FILED WITH THE INCOME TAX DEPARTMENT")).toBeVisible();
  const state=await (await page.request.get(`/api/filings/${id}`)).json();expect(state.filing.demo.phase).toBe("verified");expect(state.filing.officialReference).toBeNull();expect(state.filing.acknowledgement).toBeNull();
  const receipt=await (await page.request.get(`/api/filings/${id}/demo-receipt`)).json();expect(receipt.actuallyFiled).toBe(false);expect(receipt.acknowledgement.number).toMatch(/^DEMO-ACK-/);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"artifacts/saral-demo-receipt.png",fullPage:true,animations:"disabled"});
  expect((await page.request.post(`/api/filings/${id}/submit`,{headers:origin,data:{confirmSubmission:true,hash:state.reviewHash}})).status()).toBe(403);
});

test("one-question scenario uses the chat and voice requires explicit microphone consent",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:/Just one question/}).click();await page.getByRole("button",{name:/Experience the demo/}).click();
  await expect(page.getByRole("heading",{name:"Just one thing, Aarav."})).toBeVisible();
  expect(await page.locator('input[type="number"]').count()).toBe(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await page.getByRole("button",{name:"Voice call",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("button",{name:"Agree & start voice call"})).toBeVisible();
  await page.screenshot({path:"artifacts/saral-voice-call.png",fullPage:true,animations:"disabled"});
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("demo endpoints enforce ownership, revisions, consent and phase order",async({request,browser})=>{
  expect((await request.post("/api/demo/start",{headers:{Origin:"https://untrusted.example"},data:{scenario:"complete",consent:true}})).status()).toBe(403);
  const response=await request.post("/api/demo/start",{headers:origin,data:{scenario:"complete",consent:true}});expect(response.status()).toBe(201);const v=await response.json(),id=v.filing.id;
  expect((await request.post(`/api/filings/${id}/demo-verify`,{headers:origin,data:{confirmed:true,revision:v.filing.revision}})).status()).toBe(409);
  expect((await request.get(`/api/filings/${id}/demo-receipt`)).status()).toBe(409);
  expect((await request.post(`/api/filings/${id}/demo-fetch`,{headers:origin,data:{confirmed:true,revision:99}})).status()).toBe(409);
  const other=await browser.newContext();await other.request.post("http://127.0.0.1:3000/api/auth/local",{headers:origin,data:{sampleDataOnly:true}});
  expect((await other.request.get(`http://127.0.0.1:3000/api/filings/${id}`)).status()).toBe(404);
  expect((await request.post(`/api/filings/${id}/speech`,{headers:origin,data:{text:"test",aiConsent:false}})).status()).toBe(400);
  expect((await request.get("/api/admin")).status()).toBe(403);await other.close();
});

test("ending a voice call releases microphone tracks and closes the audio context",async({page})=>{
  await page.addInitScript(()=>{
    const w=window as typeof window&{voiceStops:number;audioCloses:number};w.voiceStops=0;w.audioCloses=0;
    const track={stop:()=>{w.voiceStops++;}};
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[track]})}});
    class FakeAudioContext{
      destination={};resume(){return Promise.resolve();}close(){w.audioCloses++;return Promise.resolve();}
      createAnalyser(){return {fftSize:512,getByteTimeDomainData:(buffer:Uint8Array)=>buffer.fill(128),connect:()=>{}};}
      createMediaStreamSource(){return {connect:()=>{}};}decodeAudioData(){return Promise.resolve({});}
      createBufferSource(){return {buffer:null,onended:null as (()=>void)|null,connect:()=>{},start(){setTimeout(()=>this.onended?.(),20);},stop(){this.onended?.();}};}
    }
    class FakeRecorder{
      static isTypeSupported(){return true;}state="inactive";mimeType="audio/webm";onstop:(()=>void)|null=null;ondataavailable:unknown;
      start(){this.state="recording";}stop(){this.state="inactive";this.onstop?.();}
    }
    Object.defineProperty(window,"AudioContext",{configurable:true,value:FakeAudioContext});Object.defineProperty(window,"MediaRecorder",{configurable:true,value:FakeRecorder});
  });
  await page.route("**/api/filings/*/speech",route=>route.fulfill({status:200,contentType:"audio/wav",body:Buffer.from("mock-audio")}));
  await page.goto("/");await page.getByRole("button",{name:/Everything connected/}).click();await page.getByRole("button",{name:/Experience the demo/}).click();await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  await page.getByRole("button",{name:"Voice call",exact:true}).click();
  expect(await page.evaluate(()=>(window as typeof window&{voiceStops:number}).voiceStops)).toBe(0);
  await page.getByRole("button",{name:"Agree & start voice call"}).click();await expect(page.getByRole("heading",{name:"I’m listening."})).toBeVisible();
  await page.getByRole("button",{name:"End voice call"}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(()=>(window as typeof window&{voiceStops:number}).voiceStops)).toBe(1);
  expect(await page.evaluate(()=>(window as typeof window&{audioCloses:number}).audioCloses)).toBe(1);
});
