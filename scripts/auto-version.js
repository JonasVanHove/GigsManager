#!/usr/bin/env node

/**
 * Automatically bump SemVer version based on git commits since latest tag.
 *
 * Rules (Conventional Commits):
 * - major: commit contains BREAKING CHANGE or subject has !: (e.g. feat!: ...)
 * - minor: at least one commit subject starts with feat:
 * - patch: all other commits
 *
 * Usage:
 *   node scripts/auto-version.js
 *   node scripts/auto-version.js --dry-run
 *   node scripts/auto-version.js patch|minor|major
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const allowedManualTypes = new Set(['patch', 'minor', 'major']);
const args = process.argv.slice(2);
const manualType = args.find((arg) => allowedManualTypes.has(arg));
const isDryRun = args.includes('--dry-run');

function exec(command) {
  return execSync(command, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim();
}

function safeExec(command) {
  try {
    return exec(command);
  } catch {
    return '';
  }
}

function isGitClean() {
  const status = safeExec('git status --porcelain');
  return status === '';
}

function getLatestSemverTag() {
  const tagList = safeExec('git tag --list "v[0-9]*.[0-9]*.[0-9]*" --sort=-version:refname');
  if (!tagList) return null;
  const tags = tagList.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  return tags[0] || null;
}

function getPackageVersion() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return String(pkg.version || '0.0.0');
}

function tagExists(tagName) {
  const match = safeExec(`git tag --list "${tagName}"`);
  return match === tagName;
}

function getCommitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = safeExec(`git log ${range} --pretty=format:%s`);
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectBumpType(subjects) {
  const hasBreaking = subjects.some(
    (subject) => /BREAKING CHANGE/i.test(subject) || /^[a-z]+(\(.+\))?!:/i.test(subject)
  );
  if (hasBreaking) return 'major';

  const hasFeature = subjects.some((subject) => /^feat(\(.+\))?:/i.test(subject));
  if (hasFeature) return 'minor';

  return 'patch';
}

try {
  if (!isDryRun && !isGitClean()) {
    console.error('❌ Working tree is not clean. Commit or stash your changes first.');
    process.exit(1);
  }

  const latestTag = getLatestSemverTag();
  const packageVersion = getPackageVersion();
  const expectedCurrentTag = `v${packageVersion}`;
  const hasCurrentTag = tagExists(expectedCurrentTag);

  if (!hasCurrentTag && latestTag && latestTag !== expectedCurrentTag) {
    console.log(
      `⚠️ Latest git tag (${latestTag}) does not match package.json version (${expectedCurrentTag}).`
    );
    console.log('   Tip: run one manual release to sync version tags, then use release:auto regularly.');
  }

  const subjects = getCommitsSince(latestTag);

  if (subjects.length === 0) {
    console.log('ℹ️ No commits since latest version tag. Nothing to bump.');
    process.exit(0);
  }

  const autoType = detectBumpType(subjects);
  const versionType = manualType || autoType;

  console.log(`🔎 Latest semver tag: ${latestTag || '(none found)'}`);
  console.log(`🔎 Commits analyzed: ${subjects.length}`);
  console.log(`🔎 Bump type: ${versionType}${manualType ? ' (manual override)' : ' (auto-detected)'}`);

  if (isDryRun) {
    console.log('');
    console.log('Dry run - no version bump performed.');
    console.log('Recent commit subjects:');
    subjects.slice(0, 10).forEach((subject, index) => {
      console.log(`  ${index + 1}. ${subject}`);
    });
    process.exit(0);
  }

  execSync(`npm version ${versionType} -m "chore: bump version to %s"`, {
    stdio: 'inherit',
  });

  console.log('✅ Automatic version bump completed.');
  console.log('   - package.json updated');
  console.log('   - src/lib/version.ts regenerated');
  console.log('   - git commit + tag created');
  console.log('   - changes pushed via postversion');
} catch (error) {
  console.error('❌ Automatic version bump failed:', error.message);
  process.exit(1);
}
