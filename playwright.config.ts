import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"tests/e2e",fullyParallel:false,workers:1,timeout:60000,
  use:{baseURL:"http://127.0.0.1:3000",browserName:"chromium",channel:"chrome",headless:true,viewport:{width:1440,height:1100},trace:"retain-on-failure"},
  webServer:{command:"npm run dev",url:"http://127.0.0.1:3000",reuseExistingServer:true,timeout:120000},
  reporter:"list",
});
