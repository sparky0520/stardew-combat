import Phaser from 'phaser';
import { Client, Room, Callbacks } from '@colyseus/sdk';
import { GameState, Player } from '../schema/GameState';
import { mapData, TILE_SIZE, SCALE, TILE_WALL } from '../shared/mapConfig';

export class GameScene extends Phaser.Scene {
    private client!: Client;
    private room!: Room<GameState>;
    private playerEntities: { [sessionId: string]: Phaser.Physics.Arcade.Sprite } = {};
    private weaponDropEntities: { [id: string]: Phaser.GameObjects.Sprite } = {};
    private nameTexts: { [sessionId: string]: Phaser.GameObjects.Text } = {};
    private healthBars: { [sessionId: string]: Phaser.GameObjects.Graphics } = {};
    private wallLayer!: Phaser.Tilemaps.TilemapLayer;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private spaceKey!: Phaser.Input.Keyboard.Key;
    private tabKey!: Phaser.Input.Keyboard.Key;
    private playerName!: string;
    private roomNumber!: string;
    private playerSprite!: string;

    constructor() {
        super({ key: 'GameScene' });
    }

    init(data: any) {
        this.playerName = data.playerName || 'Player';
        this.roomNumber = data.roomNumber || 'game_room';
        this.playerSprite = data.playerSprite || 'priest1';
    }

    preload() {
        const sprites = ['priest1', 'priest2', 'priest3', 'skeleton1', 'skeleton2', 'skull', 'vampire'];
        sprites.forEach(sprite => {
            const isPriest = sprite.startsWith('priest');
            const folder = isPriest ? 'priests_idle' : 'monsters_idle';
            const filePrefix = sprite === 'skeleton1' ? 'skeleton' : sprite;
            for (let i = 1; i <= 4; i++) {
                this.load.image(`${sprite}_f${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/Character_animation/${folder}/${sprite}/v1/${filePrefix}_v1_${i}.png`);
            }
        });
        this.load.image('chest', 'assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/mini_chest/mini_chest_1.png');
        this.load.image('dungeon_tiles', 'assets/dungeon/2D Pixel Dungeon Asset Pack/character and tileset/Dungeon_Tileset.png');
    }

    async create() {
        const MAP_PIXEL_SIZE = 40 * TILE_SIZE * SCALE; // 1280

        // Setup Map and Camera
        this.cameras.main.setBounds(0, 0, MAP_PIXEL_SIZE, MAP_PIXEL_SIZE);
        this.cameras.main.setZoom(2); // Zoom in on the pixel art
        this.physics.world.setBounds(0, 0, MAP_PIXEL_SIZE, MAP_PIXEL_SIZE);
        
        // Build tilemap
        const map = this.make.tilemap({ data: mapData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
        const tileset = map.addTilesetImage('dungeon_tiles');
        if (tileset) {
            this.wallLayer = map.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer;
            this.wallLayer.setScale(SCALE);
            this.wallLayer.setCollision(TILE_WALL);
        }

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
        this.tabKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        
        this.input.keyboard!.on('keydown-TAB', (event: Event) => {
            event.preventDefault();
        });

        // create animations
        const sprites = ['priest1', 'priest2', 'priest3', 'skeleton1', 'skeleton2', 'skull', 'vampire'];
        sprites.forEach(sprite => {
            const frames = [];
            for (let i = 1; i <= 4; i++) {
                frames.push({ key: `${sprite}_f${i}` });
            }
            this.anims.create({
                key: `${sprite}_idle`,
                frames: frames,
                frameRate: 8,
                repeat: -1
            });
        });

        // Connect to the local Colyseus server
        this.client = new Client('ws://localhost:2567');
        
        try {
            this.room = await this.client.joinOrCreate<GameState>(this.roomNumber, { name: this.playerName, sprite: this.playerSprite });
            console.log('Joined room:', this.room.name);
            
            this.setupColyseusListeners();
            this.setupInputEvents();
        } catch (e) {
            console.error('Failed to join room', e);
        }
    }

    private setupColyseusListeners() {
        const callbacks = Callbacks.get(this.room);

        let killLogTimeout: NodeJS.Timeout;
        this.room.onMessage("killLog", (data) => {
            const logger = document.getElementById('kill-logger');
            if (logger) {
                logger.innerText = `You Killed ${data.name}!`;
                logger.style.opacity = '1';
                clearTimeout(killLogTimeout);
                killLogTimeout = setTimeout(() => {
                    logger.style.opacity = '0';
                }, 3000);
            }
        });

        // Listen for new players
        callbacks.onAdd("players", (player: Player, sessionId: string) => {
            console.log('Player added:', sessionId, player);
            
            const isCurrentPlayer = sessionId === this.room.sessionId;
            const spriteKey = player.sprite || 'priest1';
            
            const entity = this.physics.add.sprite(player.x, player.y, `${spriteKey}_f1`);
            entity.setScale(2); 
            entity.setCollideWorldBounds(true);
            entity.play(`${spriteKey}_idle`);
            
            if (this.wallLayer) {
                this.physics.add.collider(entity, this.wallLayer);
            }
            
            if (isCurrentPlayer) {
                this.cameras.main.startFollow(entity, true, 0.1, 0.1);
                const minimap = this.cameras.getCamera('mini');
                if (minimap) minimap.startFollow(entity, true, 0.1, 0.1);
            } else {
                const text = this.add.text(player.x, player.y - 30, player.name || 'Unknown', {
                    fontSize: '12px',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2
                }).setOrigin(0.5, 0.5);
                this.nameTexts[sessionId] = text;
                
                const hpBar = this.add.graphics();
                hpBar.setPosition(player.x, player.y - 18);
                hpBar.fillStyle(0xff0000);
                hpBar.fillRect(-15, 0, 30, 4);
                hpBar.fillStyle(0x00ff00);
                hpBar.fillRect(-15, 0, 30 * (player.health / 100), 4);
                this.healthBars[sessionId] = hpBar;
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
            const text = this.nameTexts[sessionId];
            if (text) {
                text.destroy();
                delete this.nameTexts[sessionId];
            }
            const hpBar = this.healthBars[sessionId];
            if (hpBar) {
                hpBar.destroy();
                delete this.healthBars[sessionId];
            }
        });

        // Listen for weapon drops
        let dropLogTimeout: NodeJS.Timeout;
        callbacks.onAdd("weaponDrops", (drop: any, dropId: string) => {
            console.log('Weapon drop spawned:', drop);
            const entity = this.add.sprite(drop.x, drop.y, 'chest');
            entity.setScale(1.5); // Slightly scale up the chest
            this.weaponDropEntities[dropId] = entity;
            
            const logger = document.getElementById('drop-logger');
            if (logger) {
                logger.innerText = `A weapon drop has spawned!`;
                logger.style.color = '#55ff55';
                logger.style.opacity = '1';
                clearTimeout(dropLogTimeout);
                dropLogTimeout = setTimeout(() => {
                    logger.style.opacity = '0';
                }, 3000);
            }
        });

        this.room.onMessage("weaponTaken", (data) => {
            const logger = document.getElementById('drop-logger');
            if (logger) {
                logger.innerText = `Weapons cache was taken by ${data.name}!`;
                logger.style.color = '#ffaa00'; // Make it golden to stand out
                logger.style.opacity = '1';
                clearTimeout(dropLogTimeout);
                dropLogTimeout = setTimeout(() => {
                    logger.style.opacity = '0';
                }, 3000);
            }
        });

        this.room.onMessage("respawn", (data) => {
            const meEntity = this.playerEntities[this.room.sessionId];
            if (meEntity) {
                meEntity.setPosition(data.x, data.y);
            }
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
                    if (sessionId !== this.room.sessionId) {
                        this.tweens.add({
                            targets: entity,
                            x: player.x,
                            y: player.y,
                            duration: 50
                        });
                        const text = this.nameTexts[sessionId];
                        if (text) {
                            this.tweens.add({
                                targets: text,
                                x: player.x,
                                y: player.y - 30,
                                duration: 50
                            });
                        }
                        const hpBar = this.healthBars[sessionId];
                        if (hpBar) {
                            this.tweens.add({
                                targets: hpBar,
                                x: player.x,
                                y: player.y - 18,
                                duration: 50
                            });
                            hpBar.clear();
                            hpBar.fillStyle(0xff0000);
                            hpBar.fillRect(-15, 0, 30, 4);
                            hpBar.fillStyle(0x00ff00);
                            hpBar.fillRect(-15, 0, 30 * Math.max(0, player.health) / 100, 4);
                        }
                    }
                    
                    // Visually indicate immunity
                    if (player.isImmune) {
                        entity.setAlpha(0.5);
                    } else {
                        entity.setAlpha(1);
                    }
                }
            });
            this.updateUI();
        });
        
        this.room.onMessage("gameOver", (winner: any) => {
            document.getElementById('timer')!.innerText = `Game Over! Winner: ${winner.sessionId} with ${winner.kills} kills`;
        });
    }

    private updateUI() {
        const me = this.room.state.players?.get(this.room.sessionId);
        
        const deathScreen = document.getElementById('death-screen');
        if (me && deathScreen) {
            if (me.health <= 0) {
                deathScreen.style.display = 'flex';
            } else {
                deathScreen.style.display = 'none';
            }
        }
        
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
            this.room.state.players?.forEach((player: any, sessionId: string) => {
                const isMe = sessionId === this.room.sessionId ? ' (You)' : '';
                const pName = player.name || sessionId.substring(0, 4);
                html += `${pName}${isMe}: ${player.kills} kills<br/>`;
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

    update(_time: number, _delta: number) {
        if (!this.room) return;

        // Tab key logic
        if (this.tabKey.isDown) {
            document.getElementById('scoreboard')!.style.display = 'block';
            document.getElementById('dark-overlay')!.style.display = 'block';
        } else {
            document.getElementById('scoreboard')!.style.display = 'none';
            document.getElementById('dark-overlay')!.style.display = 'none';
        }

        // Pickup weapon
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            this.room.send("pickup");
        }

        // Handle local input
        const me = this.room.state.players?.get(this.room.sessionId);
        if (!me || me.health <= 0) {
            const currentPlayer = this.playerEntities[this.room.sessionId];
            if (currentPlayer) currentPlayer.setVelocity(0, 0);
            return;
        }

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
