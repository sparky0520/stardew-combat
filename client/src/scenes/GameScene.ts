import Phaser from 'phaser';
import { Client, Room, Callbacks } from '@colyseus/sdk';
import { GameState, Player } from '../schema/GameState';

export class GameScene extends Phaser.Scene {
    private client!: Client;
    private room!: Room<GameState>;
    private playerEntities: { [sessionId: string]: Phaser.GameObjects.Sprite } = {};
    private weaponDropEntities: { [id: string]: Phaser.GameObjects.Arc } = {};
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private spaceKey!: Phaser.Input.Keyboard.Key;

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        this.load.image('player', 'player.jpg');
    }

    async create() {
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
            
            const entity = this.add.sprite(player.x, player.y, 'player');
            entity.setScale(0.1); // Scale it down since AI generated images are usually large
            
            const isCurrentPlayer = sessionId === this.room.sessionId;
            if (!isCurrentPlayer) {
                entity.setTint(0xff8888); // Tint enemies slightly red
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
            console.log(drop);
            const entity = this.add.circle(drop.x, drop.y, 10, 0xffff00); // Yellow circle for weapon drop
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
                if (entity) {
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
            
            // Move locally
            const currentPlayer = this.playerEntities[this.room.sessionId];
            if (currentPlayer) {
                // To keep it simple in this prototype, we send the new intended position.
                // In a true authoritative game, we send inputs and the server simulates.
                const newX = currentPlayer.x + dx * speed * (delta / 1000);
                const newY = currentPlayer.y + dy * speed * (delta / 1000);
                
                this.room.send("move", { x: newX, y: newY });
            }
        }
    }
}
