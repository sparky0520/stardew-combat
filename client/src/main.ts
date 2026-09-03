import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

function startGame(playerName: string, roomNumber: string, playerSprite: string) {
    // Hide home screen, show app and UI
    document.getElementById('home-screen')!.style.display = 'none';
    document.getElementById('app')!.style.display = 'block';
    document.getElementById('ui-layer')!.style.display = 'block';

    // Set to true to see pink collision bounding boxes for all sprites
    const ENABLE_PHYSICS_DEBUG = false;

    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: 'app',
        width: window.innerWidth,
        height: window.innerHeight,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        pixelArt: true,
        input: { gamepad: true },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: ENABLE_PHYSICS_DEBUG
            }
        },
        scene: [GameScene]
    };

    const game = new Phaser.Game(config);
    
    // Pass custom data to the GameScene
    game.scene.start('GameScene', { playerName, roomNumber, playerSprite });
}

const reconnectionToken = sessionStorage.getItem('reconnectionToken');

if (reconnectionToken) {
    const pName = sessionStorage.getItem('playerName');
    const rNum = sessionStorage.getItem('roomNumber');
    const pSprite = sessionStorage.getItem('playerSprite');
    
    if (pName && rNum && pSprite) {
        startGame(pName, rNum, pSprite);
    } else {
        sessionStorage.clear();
    }
}

document.getElementById('join-btn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('player-name') as HTMLInputElement;
    const roomInput = document.getElementById('room-number') as HTMLInputElement;
    const spriteInput = document.getElementById('player-sprite') as HTMLInputElement;

    const playerName = nameInput.value || nameInput.placeholder || 'Player';
    const roomNumber = roomInput.value || roomInput.placeholder || 'Lobby 1';
    const playerSprite = spriteInput.value;
    
    if (!playerSprite) return;

    // Save these so a refresh can use them if it falls back to joinOrCreate
    sessionStorage.setItem('playerName', playerName);
    sessionStorage.setItem('roomNumber', roomNumber);
    sessionStorage.setItem('playerSprite', playerSprite);

    startGame(playerName, roomNumber, playerSprite);
});
