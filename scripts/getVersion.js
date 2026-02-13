#!/usr/bin/env node

/**
 * Get the latest git tag/version
 * Runs during build to capture current version
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Primary source: package.json version (most reliable)
  let version = 'unknown';
  
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
    version = pkg.version;
  } catch (err) {
    // Fallback 1: Try git tags
    try {
      const tag = execSync('git describe --tags --always', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
      }).trim();
      
      // Clean up the tag (remove 'v' prefix if present, and any trailing commits)
      version = tag.replace(/^v/, '').split('-')[0];
    } catch {
      // Fallback 2: Use 'dev' for development
      version = 'dev';
    }
  }

  // Write to a version file that the app can import
  const versionFile = path.join(__dirname, '../src', 'lib', 'version.ts');
  const content = `// Auto-generated during build
export const APP_VERSION = '${version}';\n`;
  
  fs.writeFileSync(versionFile, content);
  console.log(`✓ Version file generated: v${version}`);
} catch (error) {
  console.error('Failed to generate version:', error.message);
  // Don't fail the build, just use a fallback
  const versionFile = path.join(__dirname, '../src', 'lib', 'version.ts');
  const content = `// Auto-generated during build (fallback)
export const APP_VERSION = 'unknown';\n`;
  fs.writeFileSync(versionFile, content);
}
