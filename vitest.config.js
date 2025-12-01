import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 100000,
    include: ['test/**/*.ts'],
    exclude: ['test/OutputCtl.ts'],
  },
})
