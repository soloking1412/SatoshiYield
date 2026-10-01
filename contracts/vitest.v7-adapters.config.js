import { defineConfig } from 'vite';
import { vitestSetupFilePath, getClarinetVitestsArgv } from '@hirosystems/clarinet-sdk/vitest';
export default defineConfig({test:{
  include:['tests/v7-adapters/**/*.test.ts'],environment:'clarinet',silent:true,
  pool:'forks',maxWorkers:1,isolate:false,fileParallelism:false,setupFiles:[vitestSetupFilePath],
  environmentOptions:{clarinet:{...getClarinetVitestsArgv(),manifestPath:'./Clarinet.v7-adapter-analysis.toml'}},
}});
