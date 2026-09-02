import Phaser from 'phaser';
import { Client, Room, Callbacks } from '@colyseus/sdk';
import { GameState, Player } from '../schema/GameState';

export class GameScene extends Phaser.Scene {
    private client!: Client;
    private room!: Room<GameState>;
    private playerEntities: { [sessionId: string]: Phaser.Physics.Arcade.Sprite } = {};
    private weaponDropEntities: { [id: string]: Phaser.GameObjects.Sprite } = {};
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private spaceKey!: Phaser.Input.Keyboard.Key;

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        this.load.image('player', 'assets/dungeon/2D Pixel Dungeon Asset Pack/Character_animation/priests_idle/priest1/v1/priest1_v1_1.png');
        this.load.image('enemy', 'assets/dungeon/2D Pixel Dungeon Asset Pack/Character_animation/monsters_idle/skull/v1/skull_v1_1.png');
        this.load.image('chest', 'assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/mini_chest/mini_chest_1.png');
    }

    async create() {
        // Setup Map and Camera
        this.cameras.main.setBounds(0, 0, 1200, 1200);
        this.cameras.main.setZoom(2); // Zoom in on the pixel art
        this.physics.world.setBounds(0, 0, 1200, 1200);
        
        // Draw a basic grid background
        this.add.grid(600, 600, 1200, 1200, 50, 50, 0x222222, 1, 0x333333, 1);

        // Setup Minimap (Top Left corner)
        const minimap = this.cameras.add(10, 50, 200, 200).setZoom(0.4).setName('mini');
        minimap.setBackgroundColor(0x001122);
        
        // Add a visual border to the minimap (drawn on the main UI layer)
        const border = this.add.graphics();
        border.lineStyle(4, 0xffffff, 1);
        border.strokeRect(10, 50, 200, 200);
        border.setScrollFactor(0); // Fix it to the screen
        minimap.ignore(border); // Don't draw the border inside the minimap itself

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        
        // Connect to the local Colyseus server
        this.client = new Client('ws://localhost:2567');
        
        try {
            this.room = await this.client.joinOrCreate<GameState>('game_room');
            console.log('Joined room:', this.room.name);
            
            this.setupColyseusListeners();
            this.setupInputEvents();
        } catch (e) {
            console.error('Failed to join room', e);
        }
    }

    private setupColyseusListeners() {
        const callbacks = Callbacks.get(this.room);

        // Listen for new players
        callbacks.onAdd("players", (player: Player, sessionId: string) => {
            console.log('Player added:', sessionId, player);
            
            const isCurrentPlayer = sessionId === this.room.sessionId;
            const spriteKey = isCurrentPlayer ? 'player' : 'enemy';
            
            const entity = this.physics.add.sprite(player.x, player.y, spriteKey);
            entity.setScale(2); 
            entity.setCollideWorldBounds(true);
            
            if (isCurrentPlayer) {
                this.cameras.main.startFollow(entity, true, 0.1, 0.1);
                const minimap = this.cameras.getCamera('mini');
                if (minimap) minimap.startFollow(entity, true, 0.1, 0.1);
            }
            
            this.playerEntities[sessionId] = entity;
        });

        // Listen for players leaving
        callbacks.onRemove("players", (_player: Player, sessionId: string) => {
            const entity = this.playerEntities[sessionId];
            if (entity) {
                entity.destroy();
                delete this.playerEntities[sessionId];
            }
        });

        // Listen for weapon drops
        callbacks.onAdd("weaponDrops", (drop: any, dropId: string) => {
            console.log('Weapon drop spawned:', drop);
            const entity = this.add.sprite(drop.x, drop.y, 'chest');
            entity.setScale(1.5); // Slightly scale up the chest
            this.weaponDropEntities[dropId] = entity;
        });

        callbacks.onRemove("weaponDrops", (_drop: any, dropId: string) => {
            const entity = this.weaponDropEntities[dropId];
            if (entity) {
                entity.destroy();
                delete this.weaponDropEntities[dropId];
            }
        });

        // Listen for game state changes (timer/kills/movement)
        this.room.onStateChange((state) => {
            state.players.forEach((player: Player, sessionId: string) => {
                const entity = this.playerEntities[sessionId];
                if (entity && sessionId !== this.room.sessionId) {
                    this.tweens.add({
                        targets: entity,
                        x: player.x,
                        y: player.y,
                        duration: 50
                    });
                }
            });
            this.updateUI();
        });
        
        this.room.onMessage("gameOver", (winner: any) => {
            document.getElementById('timer')!.innerText = `Game Over! Winner: ${winner.sessionId} with ${winner.kills} kills`;
        });
    }

    private updateUI() {
        const me = this.room.state.players.get(this.room.sessionId);
        
        const timerEl = document.getElementById('timer');
        if (timerEl) {
            let uiText = `Time Left: ${this.room.state.timeLeft}s`;
            if (me) {
                uiText += ` | Health: ${me.health} | Weapon: ${me.weaponId || 'None'} | Ammo: ${me.ammo}`;
            }
            timerEl.innerText = uiText;
        }
        
        const scoreboardEl = document.getElementById('scoreboard');
        if (scoreboardEl) {
            let html = '<b>Scoreboard</b><br/>';
            this.room.state.players.forEach((player: any, sessionId: string) => {
                const isMe = sessionId === this.room.sessionId ? ' (You)' : '';
                html += `${sessionId.substring(0, 4)}${isMe}: ${player.kills} kills<br/>`;
            });
            scoreboardEl.innerHTML = html;
        }
    }

    private setupInputEvents() {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown() && this.room) {
                this.room.send("attack");
                
                // Visual cue for attack
                const me = this.playerEntities[this.room.sessionId];
                if (me) {
                    const slash = this.add.circle(me.x, me.y, 30, 0xffffff, 0.5);
                    this.tweens.add({
                        targets: slash,
                        alpha: 0,
                        scale: 1.5,
                        duration: 150,
                        onComplete: () => slash.destroy()
                    });
                }
            }
        });
    }

    update(_time: number, delta: number) {
        if (!this.room) return;

        // Pickup weapon
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            this.room.send("pickup");
        }

        // Handle local input
        const speed = 200;
        let dx = 0;
        let dy = 0;

        if (this.cursors.left.isDown) dx -= 1;
        if (this.cursors.right.isDown) dx += 1;
        if (this.cursors.up.isDown) dy -= 1;
        if (this.cursors.down.isDown) dy += 1;

        if (dx !== 0 || dy !== 0) {
            // Normalize direction vector
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
            
            // Move locally using physics
            const currentPlayer = this.playerEntities[this.room.sessionId];
            if (currentPlayer) {
                currentPlayer.setVelocity(dx * speed, dy * speed);
                
                // Send the resulting physics position to the server
                this.room.send("move", { x: currentPlayer.x, y: currentPlayer.y });
            }
        } else {
            const currentPlayer = this.playerEntities[this.room.sessionId];
            if (currentPlayer) {
                currentPlayer.setVelocity(0, 0);
            }
        }
    }
}
