import {expect,test} from "@playwright/test";

test("sample sign-in is explicit and signs out without presenting email auth",async({page})=>{
  await page.goto("/login");
  await expect(page.getByRole("heading",{name:"Try the interactive demo."})).toBeVisible();
  await expect(page.getByLabel("Email address · ईमेल")).toHaveCount(0);
  const open=page.getByRole("button",{name:/Open sample workspace/});
  await expect(open).toBeDisabled();
  await page.getByRole("checkbox",{name:/fictional information only/}).check();
  await open.click();
  await expect(page).toHaveURL(/\/filings\/new$/);
  const active=await (await page.request.get("/api/session")).json();
  expect(active.user?.local).toBe(true);
  await page.goto("/login");
  await expect(page.getByRole("heading",{name:"Your sample workspace is open."})).toBeVisible();
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page.getByRole("heading",{name:"Less paperwork."})).toBeVisible();
  const ended=await (await page.request.get("/api/session")).json();
  expect(ended.user).toBeNull();
});
