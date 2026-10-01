import { defineConfig } from 'vite';
import { vitestSetupFilePath, getClarinetVitestsArgv } from '@hirosystems/clarinet-sdk/vitest';
export default defineConfig({ test: {
  include: ['tests/hermetica-v7/**/*.test.ts'], silent: true, testTimeout: 120000, onConsoleLog: () => false, environment: 'clarinet',
  pool: 'forks', maxWorkers: 1,
    // Clarinet resets the chain before each test; share the environment to aggregate reports.
    isolate: false, fileParallelism: false,
  setupFiles: [vitestSetupFilePath],
  environmentOptions: { clarinet: { ...getClarinetVitestsArgv(), manifestPath: './Clarinet.hermetica-v7.toml' } },
}});
