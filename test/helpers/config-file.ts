import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RespectifyConfig } from '../../src/lib/config';

/** A config whose tolerances are deliberately outside the schema, to prove it is rejected. */
export type ConfigWithRawTolerances = Omit<RespectifyConfig, 'tolerances'> & {
  tolerances: Record<string, string>;
};

/** A valid config with distinctive feedback strings, so tests can tell each outcome apart. */
export function baseConfig(): RespectifyConfig {
  return {
    enabled: true,
    moderation: {
      blockDisrespectful: true,
      showFeedbackToUser: true,
      allowOverride: false,
    },
    thresholds: {
      autoApprove: 0.7,
      warn: 0.5,
      block: 0.3,
    },
    feedback: {
      approved: 'APPROVED',
      warning: 'WARNING',
      blocked: 'BLOCKED',
      offTopic: 'OFF_TOPIC',
      dogwhistle: 'DOGWHISTLE',
    },
  };
}

/** Temporary directory holding config files for one test file; removed by `cleanup`. */
export interface ConfigFileDirectory {
  write: (config: RespectifyConfig | ConfigWithRawTolerances) => string;
  cleanup: () => void;
}

export function createConfigFileDirectory(): ConfigFileDirectory {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'respectify-astro-test-'));
  let fileCount = 0;

  return {
    write: (config) => {
      fileCount += 1;
      const configPath = path.join(directory, `respectify.config.${fileCount}.json`);
      fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
      return configPath;
    },
    cleanup: () => {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
