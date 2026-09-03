import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

document.getElementById('join-btn')?.addEventListener('click', () => {
    const playerName = (document.getElementById('player-name') as HTMLInputElement).value || 'Player';
    const roomNumber = (document.getElementById('room-number') as HTMLInputElement).value || 'game_room';
    const playerSprite = (document.getElementById('player-sprite') as HTMLSelectElement).value || 'priest1';

    // Hide home screen, show app and UI
    document.getElementById('home-screen')!.style.display = 'none';
    document.getElementById('app')!.style.display = 'block';
    document.getElementById('ui-layer')!.style.display = 'block';

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
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: true
            }
        },
        scene: [GameScene]
    };

    const game = new Phaser.Game(config);
    
    // Pass custom data to the GameScene
    game.scene.start('GameScene', { playerName, roomNumber, playerSprite });
});
