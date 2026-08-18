const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './generated',
  timeout: 30000,
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://demoqa.com',
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  }
});
