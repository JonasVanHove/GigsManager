#!/usr/bin/env node
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '..', 'public');
const inputIcon = path.join(publicDir, 'favicon.png');

// Define icon sizes needed
const sizes = [
  { size: 16, name: 'favicon-16x16.png', description: 'Browser tab' },
  { size: 32, name: 'favicon-32x32.png', description: 'Browser tab (high DPI)' },
  { size: 64, name: 'favicon-64x64.png', description: 'Browser bookmark' },
  { size: 180, name: 'apple-touch-icon.png', description: 'iOS home screen' },
  { size: 192, name: 'icon-192x192.png', description: 'Android home screen' },
  { size: 512, name: 'icon-512x512.png', description: 'Android splash screen' },
];

async function optimizeIcons() {
  try {
    console.log('🎨 Optimizing favicon and generating icon variants...\n');

    // First, optimize the main favicon.png (in-place)
    const faviconStats = fs.statSync(inputIcon);
    console.log(`Original favicon.png: ${Math.round(faviconStats.size / 1024)} KB`);

    await sharp(inputIcon)
      .png({ quality: 90, effort: 9 })
      .toFile(inputIcon + '.opt');
    
    const optStats = fs.statSync(inputIcon + '.opt');
    console.log(`Optimized favicon.png: ${Math.round(optStats.size / 1024)} KB`);
    console.log(`Reduction: ${Math.round((1 - optStats.size / faviconStats.size) * 100)}%\n`);

    // Replace original with optimized version
    fs.renameSync(inputIcon + '.opt', inputIcon);

    // Generate all icon variants
    for (const { size, name, description } of sizes) {
      const outputPath = path.join(publicDir, name);
      await sharp(inputIcon)
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
        })
        .png({ quality: 90, effort: 9 })
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`✓ ${name} (${size}x${size}) - ${Math.round(stats.size / 1024)} KB - ${description}`);
    }

    console.log('\n✅ Icon optimization complete!\n');
  } catch (err) {
    console.error('❌ Error optimizing icons:', err);
    process.exit(1);
  }
}

optimizeIcons();
