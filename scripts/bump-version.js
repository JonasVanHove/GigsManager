#!/usr/bin/env node

/**
 * Helper script to bump version and create release
 * Usage: node scripts/bump-version.js [patch|minor|major]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const versionType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('❌ Invalid version type. Use: patch, minor, or major');
  process.exit(1);
}

try {
  console.log(`🚀 Bumping ${versionType} version...`);
  
  // Run npm version which will:
  // 1. Update package.json
  // 2. Create git commit
  // 3. Create git tag
  // 4. Run our "version" script (regenerate version.ts)
  // 5. Run our "postversion" script (push everything)
  execSync(`npm version ${versionType} -m "chore: bump version to %s"`, {
    stdio: 'inherit'
  });
  
  // Read the new version
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
  
  console.log(`✅ Successfully released version ${pkg.version}`);
  console.log(`   - package.json updated`);
  console.log(`   - version.ts regenerated`);
  console.log(`   - Git tag v${pkg.version} created`);
  console.log(`   - Changes pushed to remote`);
  console.log('');
  console.log('🎉 Netlify will automatically rebuild with the new version!');
  
} catch (error) {
  console.error('❌ Version bump failed:', error.message);
  process.exit(1);
}
