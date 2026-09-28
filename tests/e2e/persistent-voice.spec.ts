import {test,expect} from "@playwright/test";
import {installVoiceMocks} from "./voice-mocks";
const origin={Origin:"http://127.0.0.1:3000"};
async function begin(page:import('@playwright/test').Page){
  await page.goto("/");await page.getByRole("button",{name:/Experience the demo/}).click();await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button",{name:"Voice call",exact:true}).click();await expect(page.getByLabel("बातचीत की भाषा")).toHaveValue("hi");
  await page.getByRole("button",{name:"Agree & start voice call"}).click();await expect(page.getByRole("heading",{name:"I’m listening."})).toBeVisible();return id;
}
test("call survives navigation, pause and reopen without reacquiring the microphone",async({page})=>{
  await installVoiceMocks(page);const id=await begin(page);
  await page.getByRole("button",{name:"Minimize voice call"}).click();await expect(page.getByRole("region",{name:"Ongoing voice call"})).toBeVisible();
  await page.getByRole("link",{name:"Help & guide · सहायता"}).click();await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("region",{name:"Ongoing voice call"})).toBeVisible();expect(await page.evaluate(()=>(window as typeof window&{voiceStops:number}).voiceStops)).toBe(0);
  await page.getByRole("button",{name:"Pause microphone"}).click();expect(await page.evaluate(()=>(window as typeof window&{voiceEnabled:boolean}).voiceEnabled)).toBe(false);
  await page.getByRole("link",{name:"Connections · कनेक्शन"}).click();await expect(page.getByText("Call paused · माइक बंद")).toBeVisible();
  await page.getByRole("button",{name:"Resume microphone"}).click();expect(await page.evaluate(()=>(window as typeof window&{voiceEnabled:boolean}).voiceEnabled)).toBe(true);
  await page.getByRole("button",{name:"Expand voice call",exact:true}).click();await expect(page.getByRole("heading",{name:"I’m listening."})).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await page.getByRole("link",{name:"Open this return"}).click();await expect(page).toHaveURL(new RegExp(id));await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  expect(await page.evaluate(()=>(window as typeof window&{micRequests:number}).micRequests)).toBe(1);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"artifacts/saral-persistent-call-mobile.png",fullPage:true,animations:"disabled"});
  await page.getByRole("button",{name:"End voice call"}).click();await expect(page.getByRole("region",{name:"Ongoing voice call"})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as typeof window&{voiceStops:number}).voiceStops)).toBe(1);expect(await page.evaluate(()=>(window as typeof window&{audioCloses:number}).audioCloses)).toBe(1);
});

test("Hindi voice correction saves to the bound draft while browsing and invalidates review",async({page})=>{
  await installVoiceMocks(page);
  // Mock provider boundaries, but persist/recalculate the correction through the real draft API.
  await page.route("**/api/filings/*/transcribe",async route=>{
    expect(route.request().postData()).toContain('name="language"');
    await route.fulfill({json:{text:"मेरी एफडी का सालाना ब्याज अठारह हजार नहीं, बाईस हजार पांच सौ रुपये है। इसे ठीक कर दीजिए।"}});
  });
  let changedId="";
  await page.route("**/api/filings/*/chat",async route=>{
    const body=route.request().postDataJSON();expect(body.inputMode).toBe("voice");expect(body.voiceLanguage).toBe("hi");expect(body.text).toContain("बाईस हजार");
    const id=new URL(route.request().url()).pathname.split("/")[3];changedId=id;
    const before=await (await page.request.get(`/api/filings/${id}`)).json();
    const patched=await page.request.patch(`/api/filings/${id}`,{headers:origin,data:{revision:before.filing.revision,salary:{...before.filing.salary,depositInterest:22500}}});expect(patched.ok()).toBe(true);
    await route.fulfill({json:{...await patched.json(),voiceReply:"ठीक है। एफडी का सालाना ब्याज अब बाईस हजार पांच सौ रुपये दर्ज है। मसौदा सेव हो गया है।"}});
  });
  await page.goto("/");await page.getByRole("button",{name:/Experience the demo/}).click();await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];await page.getByRole("button",{name:"Read the prepared details"}).click();await page.getByRole("button",{name:/Approve summary/}).click();await expect(page.getByRole("button",{name:"Simulate filing my ITR"})).toBeVisible();
  await page.getByRole("button",{name:"Voice call",exact:true}).click();await page.getByRole("button",{name:"Agree & start voice call"}).click();await expect(page.getByRole("heading",{name:"I’m listening."})).toBeVisible();
  await page.getByRole("button",{name:"Minimize voice call"}).click();await page.getByRole("link",{name:"Help & guide · सहायता"}).click();
  await page.evaluate(()=>{(window as typeof window&{voiceSignalUntil:number}).voiceSignalUntil=performance.now()+650;});
  await expect.poll(async()=>{const r=await page.request.get(`/api/filings/${id}`);return (await r.json()).filing.salary.depositInterest;},{timeout:15000}).toBe(22500);
  expect(changedId).toBe(id);const saved=await (await page.request.get(`/api/filings/${id}`)).json();expect(saved.filing.status).toBe("draft");expect(saved.filing.reviewHash).toBeNull();expect(saved.filing.salary.annualSalary).toBe(1440000);
  await page.getByRole("link",{name:"Open this return"}).click();await expect(page.locator(".voice-draft-notice")).toContainText("22,500");await expect(page.locator(".voice-draft-notice")).toContainText("18,000");
  await page.getByRole("button",{name:"End voice call"}).click();expect(await page.evaluate(()=>(window as typeof window&{voiceStops:number}).voiceStops)).toBe(1);
});
