const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

async function cropImage(filePath) {
    try {
        const image = await Jimp.read(filePath);
        image.autocrop(); // Automatically crops transparent borders
        await image.write(filePath);
        console.log(`Cropped: ${filePath}`);
    } catch (e) {
        console.error(`Error cropping ${filePath}:`, e);
    }
}

async function run() {
    const dir = 'client/public/assets/enemies/Enemy_Animations_Set';
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
    for (const f of files) {
        await cropImage(path.join(dir, f));
    }
}
run();
