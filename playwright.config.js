const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 20000,
  fullyParallel: true,
  workers: 2,
  use: { viewport: { width: 1100, height: 780 }, trace: 'retain-on-failure' },
  projects: [{ name: 'webkit', use: { browserName: 'webkit' } }],
  reporter: [['list'], ['html', { open: 'never' }]]
});
