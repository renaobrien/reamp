// Separate from vite.config.ts on purpose: that one sets root to
// src/renderer for the renderer build, which would hide test/ from vitest.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
