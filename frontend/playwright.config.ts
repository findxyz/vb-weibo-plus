import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: 'list',
  use: {
    channel: process.env.PREVIEW_BROWSER_CHANNEL,
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
});
