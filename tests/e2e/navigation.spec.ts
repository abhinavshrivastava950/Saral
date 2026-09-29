import {expect,test} from "@playwright/test";

test("demo support pages, fee, status and acknowledgement stay accurate through the journey",async({page})=>{
  const browserErrors:string[]=[];
  page.on("pageerror",error=>browserErrors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")browserErrors.push(message.text());});
  page.on("response",response=>{if(response.status()>=500)browserErrors.push(`${response.status()} ${response.url()}`);});

  await page.goto("/");
  await expect(page.getByText("₹21 proposed service fee")).toBeVisible();
  await page.getByRole("button",{name:/Experience the demo/}).click();
  await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  const id=new URL(page.url()).pathname.split("/")[2];

  await page.getByRole("link",{name:"Journey status · स्थिति"}).click();
  await expect(page.getByRole("heading",{name:"Your demo journey"})).toBeVisible();
  await expect(page.getByText("DEMO · records ready · not filed")).toBeVisible();
  await expect(page.getByText("No official reference number or Income Tax Department acknowledgement exists for this demo.")).toBeVisible();

  await page.goto(`/filings/${id}/acknowledgement`);
  await expect(page.getByRole("heading",{name:"No demo receipt yet"})).toBeVisible();
  await page.goto(`/filings/${id}/payment`);
  await expect(page.getByRole("heading",{name:"Proposed service fee"})).toBeVisible();
  await expect(page.getByText("No payment has been collected for this return.",{exact:false})).toBeVisible();
  await expect(page.getByText("₹21",{exact:false})).toBeVisible();

  await page.goto("/filings");
  await expect(page.getByRole("heading",{name:"My tax returns"})).toBeVisible();
  await expect(page.locator(`a[href="/filings/${id}/status"]`)).toBeVisible();
  await page.goto("/documents");
  await expect(page.getByRole("heading",{name:"My documents"})).toBeVisible();
  await page.goto("/connections");
  await expect(page.getByRole("heading",{name:"The connections behind a simpler ITR."})).toBeVisible();
  await page.goto("/guide");
  await expect(page.getByRole("heading",{name:"ITR filing, without the confusion."})).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading",{name:"Your data deserves care."})).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading",{name:"Administrator access required."})).toBeVisible();

  await page.goto(`/filings/${id}`);
  await page.getByRole("button",{name:"Read the prepared details"}).click();
  await page.getByRole("button",{name:/Approve summary/}).click();
  await expect(page.getByRole("link",{name:"About the proposed ₹21 fee"})).toBeVisible();
  await page.getByRole("button",{name:"Simulate filing my ITR"}).click();
  await page.goto(`/filings/${id}/status`);
  await expect(page.getByText("DEMO · submitted · not filed")).toBeVisible();
  await page.goto(`/filings/${id}`);
  await page.getByRole("button",{name:"Complete demo verification"}).click();
  await page.goto(`/filings/${id}/acknowledgement`);
  await expect(page.getByRole("heading",{name:"Demo journey complete"})).toBeVisible();
  await expect(page.getByText("NOT FILED WITH THE INCOME TAX DEPARTMENT")).toBeVisible();
  const receipt=await page.request.get(`/api/filings/${id}/demo-receipt`);
  expect(receipt.ok()).toBe(true);
  expect((await receipt.json()).actuallyFiled).toBe(false);

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("one-question demo accepts a typed answer and updates the saved return",async({page})=>{
  let answered=false;
  await page.route("**/api/filings/*/chat",async route=>{
    const body=route.request().postDataJSON();
    expect(body.aiConsent).toBe(true);
    expect(body.text).toContain("18000 rupees");
    const id=new URL(route.request().url()).pathname.split("/")[3];
    const before=await (await page.request.get(`/api/filings/${id}`)).json();
    const patched=await page.request.patch(`/api/filings/${id}`,{
      headers:{Origin:"http://127.0.0.1:3000"},
      data:{revision:before.filing.revision,salary:{...before.filing.salary,depositInterest:18000}},
    });
    expect(patched.ok()).toBe(true);
    answered=true;
    await route.fulfill({json:await patched.json()});
  });
  await page.goto("/");
  await page.getByRole("button",{name:/Just one question/}).click();
  await page.getByRole("button",{name:/Experience the demo/}).click();
  await expect(page.getByRole("heading",{name:"Just one thing, Aarav."})).toBeVisible();
  await expect(page.getByRole("button",{name:"₹18,000 from my FD"})).toBeDisabled();
  await page.getByRole("button",{name:"Enable AI chat"}).click();
  await page.getByRole("button",{name:"₹18,000 from my FD"}).click();
  await expect(page.getByText("YOUR DEMO RETURN IS PREPARED")).toBeVisible();
  expect(answered).toBe(true);
  const id=new URL(page.url()).pathname.split("/")[2];
  const saved=await (await page.request.get(`/api/filings/${id}`)).json();
  expect(saved.filing.salary.depositInterest).toBe(18000);
  await expect(page.getByRole("button",{name:/Approve summary/})).toBeDisabled();
  await page.getByRole("button",{name:"Read the prepared details"}).click();
  await expect(page.getByRole("button",{name:/Approve summary/})).toBeEnabled();
});
