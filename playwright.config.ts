import { defineConfig, devices } from '@playwright/test'

const installedBrowser = process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${process.execPath} node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174`,
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...installedBrowser, viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Desktop Chrome'], ...installedBrowser, viewport: { width: 360, height: 800 } } },
  ],
})
