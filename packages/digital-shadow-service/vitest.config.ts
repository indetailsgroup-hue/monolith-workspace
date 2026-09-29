import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Configuration is validated when service modules are imported. Unit tests
    // do not connect to these services, but they still need deterministic,
    // non-secret values so importing one service cannot terminate the runner.
    env: {
      NODE_ENV: 'test',
      INFLUXDB_URL: 'http://127.0.0.1:8086',
      INFLUXDB_TOKEN: 'test-token',
      INFLUXDB_ORG: 'test-org',
      INFLUXDB_BUCKET: 'test-bucket',
      MQTT_BROKER_URL: 'mqtt://127.0.0.1:1883',
      REDIS_URL: 'redis://127.0.0.1:6379',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types/**',
        'src/**/index.ts',
      ],
      thresholds: {
        statements: 35,
        branches: 50,
        functions: 60,
        lines: 35,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
