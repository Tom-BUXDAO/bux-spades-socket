const sharp = require('sharp');
const path = require('path');
const pngToIco = require('png-to-ico');
const fs = require('fs').promises;

async function generateFavicons() {
  const inputFile = path.join(process.cwd(), 'public', 'BUX.png');
  const outputDir = path.join(process.cwd(), 'public');

  try {
    // Generate 32x32 icon.png
    await sharp(inputFile)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(outputDir, 'icon.png'));

    console.log('Generated icon.png (32x32)');

    // Generate 180x180 apple-touch-icon.png
    await sharp(inputFile)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));

    console.log('Generated apple-touch-icon.png (180x180)');

    // Generate 48x48 favicon.png
    await sharp(inputFile)
      .resize(48, 48, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));

    console.log('Generated favicon.png (48x48)');

    // Convert favicon.png to favicon.ico
    const icoBuffer = await pngToIco([path.join(outputDir, 'favicon.png')]);
    await fs.writeFile(path.join(outputDir, 'favicon.ico'), icoBuffer);
    
    console.log('Generated favicon.ico');

    // Clean up the temporary favicon.png
    await fs.unlink(path.join(outputDir, 'favicon.png'));

    console.log('\nAll favicon files generated successfully!');

  } catch (error) {
    console.error('Error generating favicons:', error);
  }
}

generateFavicons(); 