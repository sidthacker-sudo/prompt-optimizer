const sharp = require('sharp');
const fs = require('fs');

const svgBuffer = fs.readFileSync('icon.svg');

// Generate different sizes required by Chrome Web Store
const sizes = [16, 48, 128];

async function generateIcons() {
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(`assets/icon-${size}.png`);
    console.log(`✓ Generated icon-${size}.png`);
  }
  console.log('All icons generated successfully!');
}

// Create assets directory if it doesn't exist
if (!fs.existsSync('assets')) {
  fs.mkdirSync('assets');
}

generateIcons().catch(console.error);
