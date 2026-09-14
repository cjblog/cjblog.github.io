import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
/**
 * 默认打本地构建产物。设了 PLAYWRIGHT_BASE_URL 就打指定的地址，
 * 例如直接对线上跑一遍，验证「本地预览 == 线上」：
 *
 *   PLAYWRIGHT_BASE_URL=https://cjblog.github.io npx playwright test
 *
 * 这种情况下不再启动本地 webServer。
 */
const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = remoteBaseURL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  // 只跑一个 project；窄视口那条用例在自己的 describe 里用 test.use 覆盖 viewport，
  // 否则同一批用例会在桌面与移动端各跑一遍，移动端专属断言会在桌面端假失败。
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // 端到端测的是构建产物而非 dev 服务器：dev 下 Astro 按需编译，
  // 与线上真正跑的东西不是一回事。
  webServer: remoteBaseURL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
