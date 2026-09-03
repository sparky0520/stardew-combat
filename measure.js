const { Jimp } = require('jimp');

async function run() {
    const image = await Jimp.read('client/public/assets/dungeon/2D Pixel Dungeon Asset Pack/character and tileset/Dungeon_Tileset.png');
    
    // TILE_WALL is index 1.
    // 160x160 means 10 cols, 10 rows. Index 1 is x=1, y=0.
    const tx = 1 * 16;
    const ty = 0 * 16;
    
    let minX = 16, minY = 16, maxX = 0, maxY = 0;
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const hex = image.getPixelColor(tx + x, ty + y);
            const rgba = Jimp.intToRGBA(hex);
            if (rgba.a > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    console.log(`Tile 1 bounds: x=${minX}-${maxX}, y=${minY}-${maxY}`);
}
run();
