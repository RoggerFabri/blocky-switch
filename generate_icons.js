// This is a Node.js script that would convert the SVG to PNG icons
// You would need to install the "sharp" library with: npm install sharp

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sizes = [16, 48, 128];
const svgPath = path.join(__dirname, 'images', 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, 'images', `icon${size}.png`));
    
    console.log(`Generated icon${size}.png`);
  }
}

generateIcons().catch(err => console.error('Error generating icons:', err)); 