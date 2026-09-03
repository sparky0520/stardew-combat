export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 40;
export const TILE_SIZE = 16;
export const SCALE = 2; // Pixel scaling factor for the game

// Tile indices (will need to be adjusted based on the tileset visual layout)
// The tileset is 160x160 (10x10 grid of 16x16 tiles). Indices range 0-99.
export const TILE_FLOOR = 16; // Guessing row 2
export const TILE_WALL = 1;   // Guessing row 1

export const mapData: number[][] = [];
for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
        // Wall perimeter
        if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
            row.push(TILE_WALL);
        } else {
            let isWall = false;

            // Horizontal walls forming rooms
            if ((y === 12 || y === 27) && (x < 14 || x > 25)) {
                // leave a 2-tile gap in the middle of these walls for choke points
                if (!(x >= 6 && x <= 7) && !(x >= 32 && x <= 33)) isWall = true;
            }
            // Vertical walls forming rooms
            if ((x === 12 || x === 27) && (y < 14 || y > 25)) {
                if (!(y >= 6 && y <= 7) && !(y >= 32 && y <= 33)) isWall = true;
            }

            // Central pillars (4 pillars, 2x2 each)
            if ((x >= 17 && x <= 18 || x >= 21 && x <= 22) && 
                (y >= 17 && y <= 18 || y >= 21 && y <= 22)) {
                isWall = true;
            }

            // Barriers in the side corridors
            if ((y === 19 || y === 20) && (x === 6 || x === 7 || x === 32 || x === 33)) {
                isWall = true;
            }
            if ((x === 19 || x === 20) && (y === 6 || y === 7 || y === 32 || y === 33)) {
                isWall = true;
            }

            row.push(isWall ? TILE_WALL : TILE_FLOOR);
        }
    }
    mapData.push(row);
}

// Convert tile coordinates to world pixel coordinates (centered in the tile)
export const toWorld = (tx: number, ty: number) => {
    return {
        x: tx * TILE_SIZE * SCALE + (TILE_SIZE * SCALE) / 2,
        y: ty * TILE_SIZE * SCALE + (TILE_SIZE * SCALE) / 2
    };
};

export const PLAYER_SPAWNS = [
    // 4 deep corners of the rooms
    toWorld(3, 3),
    toWorld(MAP_WIDTH - 4, 3),
    toWorld(3, MAP_HEIGHT - 4),
    toWorld(MAP_WIDTH - 4, MAP_HEIGHT - 4),
    // 4 side corridor edges
    toWorld(19, 3),
    toWorld(19, MAP_HEIGHT - 4),
    toWorld(3, 19),
    toWorld(MAP_WIDTH - 4, 19)
];

export const WEAPON_SPAWNS = [
    toWorld(19, 19), // Dead center
    // Inside the 4 corner rooms to encourage close-quarters exploration
    toWorld(8, 8),
    toWorld(MAP_WIDTH - 9, 8),
    toWorld(8, MAP_HEIGHT - 9),
    toWorld(MAP_WIDTH - 9, MAP_HEIGHT - 9)
];

export const TRAP_SPAWNS = [
    // Choke points entering the main center area
    toWorld(19, 12),
    toWorld(20, 12),
    toWorld(19, 27),
    toWorld(20, 27),
    toWorld(12, 19),
    toWorld(12, 20),
    toWorld(27, 19),
    toWorld(27, 20)
];

export const TORCH_SPAWNS = [
    { ...toWorld(1, 10), angle: 0, wall: 'left' },
    { ...toWorld(1, 30), angle: 0, wall: 'left' },
    { ...toWorld(MAP_WIDTH - 2, 10), angle: Math.PI, wall: 'right' },
    { ...toWorld(MAP_WIDTH - 2, 30), angle: Math.PI, wall: 'right' },
    { ...toWorld(10, 1), angle: Math.PI / 2, wall: 'top' },
    { ...toWorld(30, 1), angle: Math.PI / 2, wall: 'top' },
    { ...toWorld(10, MAP_HEIGHT - 2), angle: -Math.PI / 2, wall: 'bottom' },
    { ...toWorld(30, MAP_HEIGHT - 2), angle: -Math.PI / 2, wall: 'bottom' }
];
