import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'docs/**',
        '**/*.test.ts',
        'vitest.config.ts',
        // Network-dependent modules - tested via integration tests
        'src/client.ts',
        'src/server.ts',
        'src/browser/**',
        'src/transport/**',
        'src/lux_consensus.ts',
        // Re-export modules
        'src/index.ts',
        'src/server/index.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
