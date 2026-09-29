import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(`Version consistency check failed: ${message}`);
  process.exitCode = 1;
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const version = packageJson.version;
const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;

const parseSemver = (value) => {
  const match = semverPattern.exec(value);
  return match ? match.slice(1).map(Number) : null;
};

const compareSemver = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

const canonical = parseSemver(version);
if (!canonical) fail(`root package.json has invalid product version ${JSON.stringify(version)}`);

if (packageLock.version !== version) {
  fail(`package-lock.json version ${packageLock.version} does not match package.json ${version}`);
}
if (packageLock.packages?.['']?.version !== version) {
  fail(`package-lock root version ${packageLock.packages?.['']?.version} does not match package.json ${version}`);
}

const marker = `**Current product version:** \`v${version}\``;
for (const path of ['README.md', 'CHANGELOG.md', '.claude/progress.md']) {
  const content = readFileSync(path, 'utf8');
  if (!content.includes(marker)) fail(`${path} is missing canonical marker ${marker}`);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes(`## [v${version}]`)) {
  fail(`CHANGELOG.md has no tagged release section for v${version}`);
}

for (const match of changelog.matchAll(/^## \[v?(\d+\.\d+\.\d+)\]/gm)) {
  const documented = parseSemver(match[1]);
  if (documented && canonical && compareSemver(documented, canonical) > 0) {
    fail(`CHANGELOG.md presents future v${match[1]} as a published release; keep it under the planned section`);
  }
}

try {
  const tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--list', 'v*'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((tag) => ({ tag, parsed: parseSemver(tag.slice(1)) }))
    .filter(({ parsed }) => parsed)
    .sort((left, right) => compareSemver(left.parsed, right.parsed));

  const latest = tags.at(-1);
  if (latest && canonical && compareSemver(latest.parsed, canonical) > 0) {
    fail(`reachable Git tag ${latest.tag} is newer than canonical v${version}`);
  }

  const canonicalTag = tags.find(({ tag }) => tag === `v${version}`);
  if (canonicalTag) {
    console.log(`Version consistency verified: v${version} matches package lock, documents, changelog, and Git tag.`);
  } else {
    console.log(`Version consistency verified for unreleased candidate v${version}; no matching reachable Git tag yet.`);
  }
} catch {
  console.log(`Version consistency verified for v${version}; Git metadata was unavailable.`);
}
