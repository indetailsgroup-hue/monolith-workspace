import { existsSync } from 'node:fs';

export function suiteHasMinimumPasses({ code, out }, minimumPasses) {
  const passMatch = String(out).match(/^# pass (\d+)\s*$/m);
  return code === 0
    && /^# fail 0\s*$/m.test(String(out))
    && passMatch !== null
    && Number(passMatch[1]) >= minimumPasses;
}

export function assertInjectionTargetAbsent(targetDir) {
  if (existsSync(targetDir)) {
    throw new Error(
      `negative-control injection target already exists; refusing to run without deleting it: ${targetDir}`,
    );
  }
}
