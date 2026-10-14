const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./test/browser',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'list',
  use:{browserName:'chromium',headless:true,trace:'retain-on-failure'},
  timeout:120000
});
