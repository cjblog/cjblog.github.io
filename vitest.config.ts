import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // src/lib/ 全是纯函数，不需要 DOM 环境
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
