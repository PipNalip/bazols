import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { describe, expect, it } from 'vitest';

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

describe('repository security boundaries', () => {
  it('does not track local credentials or private key material', () => {
    const files = trackedFiles();
    const forbiddenNames = new Set(['.env', '.env.local', 'credentials.json', 'service-account.json']);
    const forbiddenKeyMarker = ['BEGIN', 'PRIVATE KEY'].join(' ');

    expect(files.filter((file) => forbiddenNames.has(basename(file)))).toEqual([]);
    const leakingFiles = files.filter((file) => {
      try {
        return readFileSync(file, 'utf8').includes(forbiddenKeyMarker);
      } catch {
        return false;
      }
    });
    expect(leakingFiles).toEqual([]);
  });

  it('uses no Tailwind or commercial MUI X packages', () => {
    const manifests = trackedFiles().filter((file) => basename(file) === 'package.json');
    const dependencyNames = manifests.flatMap((file) => {
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
    });

    expect(dependencyNames.some((name) => name === 'tailwindcss' || name.startsWith('@tailwindcss/'))).toBe(false);
    expect(dependencyNames.some((name) => name.startsWith('@mui/x-') || name.startsWith('@mui/x/'))).toBe(false);
  });
});
