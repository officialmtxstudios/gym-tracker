import { defineConfig, devices } from '@playwright/test'

// Click-through tests in WebKit (Safari's engine) at iPhone size.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['iPhone 15'],
  },
  projects: [{ name: 'iphone-webkit', use: { browserName: 'webkit' } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
