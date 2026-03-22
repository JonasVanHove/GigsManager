#!/usr/bin/env node

/**
 * Get the latest git tag/version
 * Runs during build to capture current version
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function safeExec(command) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

try {
  let version = 'unknown';

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
    version = pkg.version;
  } catch {
    const tag = safeExec('git describe --tags --always');
    version = tag ? tag.replace(/^v/, '').split('-')[0] : 'dev';
  }

  const commitSha =
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NETLIFY_COMMIT_REF ||
    safeExec('git rev-parse HEAD') ||
    'unknown';

  const shortCommit = commitSha === 'unknown' ? 'unknown' : commitSha.slice(0, 7);

  const refName =
    process.env.GITHUB_REF_NAME ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.BRANCH ||
    safeExec('git rev-parse --abbrev-ref HEAD') ||
    'local';

  const display = `v${version}`;

  const versionFile = path.join(__dirname, '../src', 'lib', 'version.ts');
  const content = `// Auto-generated during build\nexport const APP_VERSION = '${version}';\nexport const APP_BUILD_COMMIT = '${shortCommit}';\nexport const APP_BUILD_REF = '${refName}';\nexport const APP_VERSION_DISPLAY = '${display}';\n`;

  fs.writeFileSync(versionFile, content);
  console.log(`✓ Version file generated: ${display}`);
} catch (error) {
  console.error('Failed to generate version:', error.message);
  const versionFile = path.join(__dirname, '../src', 'lib', 'version.ts');
  const content = `// Auto-generated during build (fallback)\nexport const APP_VERSION = 'unknown';\nexport const APP_BUILD_COMMIT = 'unknown';\nexport const APP_BUILD_REF = 'unknown';\nexport const APP_VERSION_DISPLAY = 'vunknown';\n`;
  fs.writeFileSync(versionFile, content);
}
