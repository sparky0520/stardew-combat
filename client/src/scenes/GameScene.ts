import Phaser from 'phaser';
import { Client, Room, Callbacks } from '@colyseus/sdk';
import { GameState, Player } from '../schema/GameState';
import { mapData, TILE_SIZE, SCALE, TILE_WALL } from '../shared/mapConfig';

export class GameScene extends Phaser.Scene {
    private client!: Client;
    private room!: Room<GameState>;
    private playerEntities: { [sessionId: string]: Phaser.Physics.Arcade.Sprite } = {};
    private weaponDropEntities: { [id: string]: Phaser.GameObjects.Sprite } = {};
    private healthPickupEntities: { [id: string]: Phaser.GameObjects.Sprite } = {};
    private trapEntities: { [id: string]: any } = {};
    private projectileEntities: { [id: string]: Phaser.GameObjects.Sprite } = {};
    private nameTexts: { [sessionId: string]: Phaser.GameObjects.Text } = {};
    private healthBars: { [sessionId: string]: Phaser.GameObjects.Graphics } = {};
    private wallLayer!: Phaser.Tilemaps.TilemapLayer;
    private lastFired: number = 0;
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
        const priests = ['priest1', 'priest2', 'priest3', 'skull'];
        priests.forEach(sprite => {
            const isPriest = sprite.startsWith('priest');
            const folder = isPriest ? 'priests_idle' : 'monsters_idle';
            for (let i = 1; i <= 4; i++) {
                this.load.image(`${sprite}_f${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/Character_animation/${folder}/${sprite}/v1/${sprite}_v1_${i}.png`);
            }
        });

        const newEnemies = ['skeleton1', 'skeleton2', 'vampire'];
        newEnemies.forEach(sprite => {
            this.load.spritesheet(`${sprite}_idle`, `assets/enemies/Enemy_Animations_Set/enemies-${sprite}_idle.png`, { frameWidth: 32, frameHeight: 32 });
            this.load.spritesheet(`${sprite}_movement`, `assets/enemies/Enemy_Animations_Set/enemies-${sprite}_movement.png`, { frameWidth: 32, frameHeight: 32 });
            this.load.spritesheet(`${sprite}_attack`, `assets/enemies/Enemy_Animations_Set/enemies-${sprite}_attack.png`, { frameWidth: 32, frameHeight: 32 });
            this.load.spritesheet(`${sprite}_take_damage`, `assets/enemies/Enemy_Animations_Set/enemies-${sprite}_take_damage.png`, { frameWidth: 32, frameHeight: 32 });
            this.load.spritesheet(`${sprite}_death`, `assets/enemies/Enemy_Animations_Set/enemies-${sprite}_death.png`, { frameWidth: 32, frameHeight: 32 });
        });

        for (let i = 1; i <= 4; i++) {
            this.load.image(`chest_${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/chest/chest_${i}.png`);
            this.load.image(`chest_open_${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/chest/chest_open_${i}.png`);
        }

        this.load.image('dungeon_tiles', 'assets/dungeon/2D Pixel Dungeon Asset Pack/character and tileset/Dungeon_Tileset.png');

        for (let i = 1; i <= 4; i++) {
            this.load.image(`trap_peaks_${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/peaks/peaks_${i}.png`);
        }
        
        for (let i = 1; i <= 4; i++) {
            this.load.image(`flame_${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/flamethrower/flamethrower_2_${i}.png`);
        }
        
        for (let i = 1; i <= 4; i++) {
            this.load.image(`torch_top_${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/torch/torch_${i}.png`);
            this.load.image(`torch_side_${i}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/torch/side_torch_${i}.png`);
        }

        this.load.image('arrow', 'assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/arrow/Just_arrow.png');
        
        for (let i = 1; i <= 4; i++) {
            for (let j = 1; j <= 4; j++) {
                this.load.image(`flasks_${i}_${j}`, `assets/dungeon/2D Pixel Dungeon Asset Pack/items and trap_animation/flasks/flasks_${i}_${j}.png`);
            }
        }
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

        // Setup Full Map (Toggleable with 'M')
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        const mapSize = Math.min(cw, ch) * 0.8;
        const mapZoom = mapSize / MAP_PIXEL_SIZE; // Fit perfectly
        
        const minimap = this.cameras.add((cw - mapSize)/2, (ch - mapSize)/2, mapSize, mapSize).setZoom(mapZoom).setName('mini');
        minimap.setBackgroundColor('rgba(0,0,0,0)'); // Transparent map bg
        minimap.centerOn(MAP_PIXEL_SIZE / 2, MAP_PIXEL_SIZE / 2);
        minimap.setVisible(false);

        // Black translucent overlay behind the map
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.5); // Match scoreboard opacity
        overlay.fillRect(0, 0, cw, ch);
        overlay.setScrollFactor(0);
        overlay.setDepth(9);
        overlay.setVisible(false);
        minimap.ignore(overlay);

        const mKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);
        mKey.on('down', () => {
            const isVisible = !minimap.visible;
            minimap.setVisible(isVisible);
            overlay.setVisible(isVisible);
        });

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.tabKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        
        this.input.keyboard!.on('keydown-TAB', (event: Event) => {
            event.preventDefault();
        });

        // create animations
        const priests = ['priest1', 'priest2', 'priest3', 'skull'];
        priests.forEach(sprite => {
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

        const enemyFrames: { [key: string]: { idle: number, movement: number, attack: number, damage: number } } = {
            'skeleton1': { idle: 6, movement: 10, attack: 9, damage: 5 },
            'skeleton2': { idle: 6, movement: 10, attack: 15, damage: 5 },
            'vampire': { idle: 6, movement: 8, attack: 16, damage: 5 }
        };

        const newEnemies = ['skeleton1', 'skeleton2', 'vampire'];
        newEnemies.forEach(sprite => {
            const f = enemyFrames[sprite];
            this.anims.create({ key: `${sprite}_idle`, frames: this.anims.generateFrameNumbers(`${sprite}_idle`, { start: 0, end: f.idle - 1 }), frameRate: 8, repeat: -1 });
            this.anims.create({ key: `${sprite}_movement`, frames: this.anims.generateFrameNumbers(`${sprite}_movement`, { start: 0, end: f.movement - 1 }), frameRate: 12, repeat: -1 });
            this.anims.create({ key: `${sprite}_attack`, frames: this.anims.generateFrameNumbers(`${sprite}_attack`, { start: 0, end: f.attack - 1 }), frameRate: 15, repeat: 0 });
            this.anims.create({ key: `${sprite}_take_damage`, frames: this.anims.generateFrameNumbers(`${sprite}_take_damage`, { start: 0, end: f.damage - 1 }), frameRate: 12, repeat: 0 });
        });

        this.anims.create({
            key: 'peaks_trigger',
            frames: [
                { key: 'trap_peaks_3' },
                { key: 'trap_peaks_2' },
                { key: 'trap_peaks_1' }
            ],
            frameRate: 10,
            repeat: -1,
            yoyo: true
        });

        this.anims.create({
            key: 'flame_fire',
            frames: [
                { key: 'flame_1' },
                { key: 'flame_2' },
                { key: 'flame_3' },
                { key: 'flame_4' }
            ],
            frameRate: 15,
            repeat: 0
        });

        this.anims.create({
            key: 'flame_fire_loop',
            frames: [
                { key: 'flame_1' },
                { key: 'flame_2' },
                { key: 'flame_3' },
                { key: 'flame_4' }
            ],
            frameRate: 15,
            repeat: -1
        });

        this.anims.create({
            key: 'torch_top_anim',
            frames: [
                { key: 'torch_top_1' },
                { key: 'torch_top_2' },
                { key: 'torch_top_3' },
                { key: 'torch_top_4' }
            ],
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'torch_side_anim',
            frames: [
                { key: 'torch_side_1' },
                { key: 'torch_side_2' },
                { key: 'torch_side_3' },
                { key: 'torch_side_4' }
            ],
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'chest_idle',
            frames: [
                { key: 'chest_1' },
                { key: 'chest_2' },
                { key: 'chest_3' },
                { key: 'chest_4' }
            ],
            frameRate: 8,
            repeat: -1
        });

        this.anims.create({
            key: 'chest_open',
            frames: [
                { key: 'chest_open_1' },
                { key: 'chest_open_2' },
                { key: 'chest_open_3' },
                { key: 'chest_open_4' }
            ],
            frameRate: 10,
            repeat: 0
        });

        for (let i = 1; i <= 4; i++) {
            this.anims.create({
                key: `flasks_${i}_anim`,
                frames: [
                    { key: `flasks_${i}_1` },
                    { key: `flasks_${i}_2` },
                    { key: `flasks_${i}_3` },
                    { key: `flasks_${i}_4` }
                ],
                frameRate: 8,
                repeat: -1
            });
        }

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
                logger.innerText = data.message || `You Killed ${data.name}!`;
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
            
            const isNewEnemy = ['skeleton1', 'skeleton2', 'vampire'].includes(spriteKey);
            const initialTexture = isNewEnemy ? `${spriteKey}_idle` : `${spriteKey}_f1`;
            
            const entity = this.physics.add.sprite(player.x, player.y, initialTexture);
            entity.setScale(2); 
            entity.setDepth(2); // Players above traps and chests
            
            // Adjust physics body size based on sprite type so transparent padding doesn't create huge collision boxes
            if (isNewEnemy) {
                // 32x32 original sprite -> shrink to center
                entity.body.setSize(14, 20);
                entity.body.setOffset(9, 12);
            } else {
                // 16x16 original sprite -> keep relatively normal, but maybe shave off a bit
                entity.body.setSize(12, 14);
                entity.body.setOffset(2, 2);
            }
            
            entity.setCollideWorldBounds(true);
            entity.play(`${spriteKey}_idle`);
            
            if (this.wallLayer) {
                this.physics.add.collider(entity, this.wallLayer);
            }
            
            if (isCurrentPlayer) {
                this.cameras.main.startFollow(entity, true, 0.1, 0.1);
            } else {
                const text = this.add.text(player.x, player.y - 30, player.name || 'Unknown', {
                    fontSize: '12px',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2
                }).setOrigin(0.5, 0.5);
                text.setDepth(3);
                this.nameTexts[sessionId] = text;
                
                const hpBar = this.add.graphics();
                hpBar.setDepth(3);
                hpBar.setPosition(player.x, player.y - 18);
                hpBar.fillStyle(0xff0000);
                hpBar.fillRect(-15, 0, 30, 4);
                hpBar.fillStyle(0x00ff00);
                hpBar.fillRect(-15, 0, 30 * (player.health / 100), 4);
                this.healthBars[sessionId] = hpBar;
            }
            
            const mini = this.cameras.getCamera('mini');
            if (!isCurrentPlayer && mini) {
                mini.ignore(entity);
                if (this.nameTexts[sessionId]) mini.ignore(this.nameTexts[sessionId]);
                if (this.healthBars[sessionId]) mini.ignore(this.healthBars[sessionId]);
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
            const entity = this.add.sprite(drop.x, drop.y, 'chest_1');
            entity.setScale(1.5); // Slightly scale up the chest
            entity.setDepth(1); // Chests above traps, below players
            entity.play('chest_idle');
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
                entity.play('chest_open');
                entity.once('animationcomplete', () => {
                    entity.destroy();
                });
                delete this.weaponDropEntities[dropId];
            }
        });

        callbacks.onAdd("healthPickups", (pickup: any, pickupId: string) => {
            const entity = this.add.sprite(pickup.x, pickup.y, 'flasks_2_1');
            entity.setScale(1.5);
            entity.setDepth(1);
            entity.play('flasks_2_anim');
            
            // Add a floating/bobbing animation
            this.tweens.add({
                targets: entity,
                y: pickup.y - 10,
                duration: 1000,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            
            this.healthPickupEntities[pickupId] = entity;
        });

        callbacks.onRemove("healthPickups", (_pickup: any, pickupId: string) => {
            const entity = this.healthPickupEntities[pickupId];
            if (entity) {
                entity.destroy();
                delete this.healthPickupEntities[pickupId];
            }
        });

        callbacks.onAdd("traps", (trap: any, trapId: string) => {
            if (trap.type.startsWith("torch_")) {
                const wallType = trap.type.split("_")[1];
                const isSide = wallType === 'left' || wallType === 'right';
                const animKey = isSide ? 'torch_side_anim' : 'torch_top_anim';
                
                const entity = this.add.sprite(trap.x, trap.y, isSide ? 'torch_side_1' : 'torch_top_1');
                entity.setScale(2);
                entity.setDepth(1.5);
                entity.play(animKey);
                
                // Adjust facing depending on wall side
                if (wallType === 'right') entity.flipX = true;
                if (wallType === 'bottom') entity.flipY = true;
                
                this.trapEntities[trapId] = entity;
            } else if (trap.type === "puddle") {
                const entity = this.add.graphics();
                entity.setPosition(trap.x, trap.y);
                entity.setDepth(0); // floor-level
                
                // Draw a bright green irregular puddle
                entity.fillStyle(0x33ff33, 0.7); // Bright transparent green
                entity.fillCircle(0, 0, 50); // Radius 50
                
                // Add an inner core
                entity.fillStyle(0x77ff77, 0.9);
                entity.fillCircle(0, 0, 30); // Radius 30

                // Add a pulse animation to make it look like bubbling acid
                this.tweens.add({
                    targets: entity,
                    scaleX: 1.1,
                    scaleY: 1.1,
                    alpha: 0.8,
                    duration: 800,
                    yoyo: true,
                    repeat: -1
                });
                
                this.trapEntities[trapId] = entity;
            } else {
                const entity = this.add.sprite(trap.x, trap.y, 'trap_peaks_3');
                entity.setScale(2);
                entity.setDepth(0); // floor-level
                this.trapEntities[trapId] = entity;
            }
        });

        callbacks.onRemove("traps", (trap: any, trapId: string) => {
            const entity = this.trapEntities[trapId];
            if (entity) {
                entity.destroy();
                delete this.trapEntities[trapId];
            }
        });

        // Listen for Projectiles
        callbacks.onAdd("projectiles", (proj: any, projId: string) => {
            if (proj.type === "fireball") {
                const entity = this.add.sprite(proj.x, proj.y, 'flame_1');
                entity.setScale(2);
                entity.setDepth(2);
                entity.setRotation(proj.angle);
                entity.play('flame_fire_loop');
                this.projectileEntities[projId] = entity;
            } else if (proj.type === "flask") {
                const entity = this.add.sprite(proj.x, proj.y, 'flasks_1_1');
                entity.setScale(1.5);
                entity.setDepth(2);
                entity.play('flasks_1_anim');
                this.projectileEntities[projId] = entity;
                // Make it spin in the air!
                this.tweens.add({
                    targets: entity,
                    rotation: Math.PI * 2,
                    duration: 500,
                    repeat: -1
                });
            } else {
                const entity = this.add.sprite(proj.x, proj.y, 'arrow');
                entity.setScale(1.5);
                entity.setDepth(2);
                entity.setRotation(proj.angle - Math.PI / 2); // Offset by -90deg
                this.projectileEntities[projId] = entity;
            }
        });

        callbacks.onRemove("projectiles", (proj: any, projId: string) => {
            const entity = this.projectileEntities[projId];
            if (entity) {
                entity.destroy();
                delete this.projectileEntities[projId];
            }
        });

        // Listen for game state changes (timer/kills/movement)
        this.room.onStateChange((state) => {
            state.players.forEach((player: Player, sessionId: string) => {
                const entity = this.playerEntities[sessionId];
                if (entity) {
                    if (sessionId !== this.room.sessionId) {
                        const isMoving = Math.abs(entity.x - player.x) > 1 || Math.abs(entity.y - player.y) > 1;
                        
                        if (isMoving) {
                            if (player.x < entity.x - 0.5) entity.flipX = true;
                            else if (player.x > entity.x + 0.5) entity.flipX = false;
                        }

                        if (['skeleton1', 'skeleton2', 'vampire'].includes(player.sprite)) {
                            if (isMoving) {
                                entity.play(`${player.sprite}_movement`, true);
                            } else if (!entity.getData('isDead') && entity.anims.currentAnim?.key !== `${player.sprite}_attack` && entity.anims.currentAnim?.key !== `${player.sprite}_take_damage`) {
                                entity.play(`${player.sprite}_idle`, true);
                            }
                        }

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
                    
                    // Death animation logic
                    const wasDead = entity.getData('isDead');
                    if (player.health <= 0 && !wasDead) {
                        entity.setData('isDead', true);
                        if (['skeleton1', 'skeleton2', 'vampire'].includes(player.sprite)) {
                            entity.play(`${player.sprite}_death`, true);
                        } else {
                            entity.setRotation(Math.PI / 2); // Generic "fallen over" for priests
                        }
                    } else if (player.health > 0 && wasDead) {
                        entity.setData('isDead', false);
                        if (['skeleton1', 'skeleton2', 'vampire'].includes(player.sprite)) {
                            entity.play(`${player.sprite}_idle`, true);
                        } else {
                            entity.setRotation(0);
                        }
                    }
                }
            });

            // Update projectiles
            state.projectiles?.forEach((proj: any, projId: string) => {
                const entity = this.projectileEntities[projId];
                if (entity) {
                    entity.setPosition(proj.x, proj.y);
                }
            });

            // Update traps
            state.traps?.forEach((trap: any, trapId: string) => {
                const entity = this.trapEntities[trapId];
                if (entity) {
                    if (trap.type === "puddle" || trap.type.startsWith("torch_")) {
                        // handled naturally via tweens/animations
                    } else {
                        const isActive = trap.active;
                        const isPlayingAnim = entity.anims && entity.anims.isPlaying && entity.anims.currentAnim?.key === 'peaks_trigger';
                        
                        if (isActive && !isPlayingAnim) {
                            entity.play('peaks_trigger');
                            entity.setTint(0xff5555);
                        } else if (!isActive && isPlayingAnim) {
                            entity.stop();
                            entity.setTexture('trap_peaks_3');
                            entity.clearTint();
                        } else if (!isActive && entity.texture?.key !== 'trap_peaks_3') {
                            entity.setTexture('trap_peaks_3');
                            entity.clearTint();
                        }
                    }
                }
            });

            this.updateUI();
        });
        
        this.room.onMessage("gameOver", (winner: any) => {
            document.getElementById('game-message')!.innerText = `Game Over! Winner: ${winner.sessionId} with ${winner.kills} kills`;
        });

        this.room.onMessage("playerAttacked", (data) => {
            const attacker = this.playerEntities[data.playerId];
            if (attacker) {
                const playerState = this.room.state.players.get(data.playerId);
                const spriteKey = playerState?.sprite;
                
                if (spriteKey && ['skeleton1', 'skeleton2', 'vampire'].includes(spriteKey)) {
                    attacker.play(`${spriteKey}_attack`, true);
                    attacker.once('animationcomplete', () => {
                        if (attacker.getData('isDead')) return;
                        attacker.play(`${spriteKey}_idle`, true);
                    });
                }
                
                if (data.weapon === 'bow') {
                    const bow = this.add.graphics();
                    bow.lineStyle(3, 0x8B4513, 1); // Brown wood
                    bow.beginPath();
                    bow.arc(0, 0, 15, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false);
                    bow.strokePath();
                    
                    bow.lineStyle(1, 0xffffff, 0.8); // String
                    bow.beginPath();
                    bow.moveTo(15 * Math.cos(Phaser.Math.DegToRad(-60)), 15 * Math.sin(Phaser.Math.DegToRad(-60)));
                    bow.lineTo(-10, 0); // Pulled back
                    bow.lineTo(15 * Math.cos(Phaser.Math.DegToRad(60)), 15 * Math.sin(Phaser.Math.DegToRad(60)));
                    bow.strokePath();

                    bow.setPosition(attacker.x, attacker.y);
                    bow.rotation = data.angle;

                    this.tweens.add({
                        targets: bow,
                        scaleX: 1.2,
                        scaleY: 0.9,
                        duration: 100,
                        yoyo: true,
                        onComplete: () => bow.destroy()
                    });
                } else if (data.weapon === 'flamethrower') {
                    const flame = this.add.sprite(attacker.x, attacker.y, 'flame_1');
                    flame.setScale(2);
                    flame.setOrigin(0, 0.5); // Pivot at the base so it shoots outward
                    flame.rotation = data.angle;
                    flame.play('flame_fire');
                    flame.once('animationcomplete', () => {
                        flame.destroy();
                    });
                } else if (!spriteKey || !['skeleton1', 'skeleton2', 'vampire'].includes(spriteKey)) {
                    const sword = this.add.graphics();
                    sword.fillStyle(0xcccccc, 1);
                    sword.lineStyle(2, 0x000000, 1);
                    sword.beginPath();
                    sword.moveTo(0, -4);
                    sword.lineTo(25, -4);
                    sword.lineTo(35, 0);
                    sword.lineTo(25, 4);
                    sword.lineTo(0, 4);
                    sword.closePath();
                    sword.fillPath();
                    sword.strokePath();

                    // Draw hilt
                    sword.fillStyle(0x8B4513, 1); // brown
                    sword.fillRect(-5, -6, 5, 12);

                    sword.setPosition(attacker.x, attacker.y);
                    sword.rotation = Phaser.Math.DegToRad(-45);

                    this.tweens.add({
                        targets: sword,
                        rotation: Phaser.Math.DegToRad(135),
                        duration: 150,
                        onComplete: () => sword.destroy()
                    });
                }
            }
        });

        this.room.onMessage("damageTaken", (data) => {
            const target = this.playerEntities[data.targetId];
            if (target) {
                const playerState = this.room.state.players.get(data.targetId);
                const spriteKey = playerState?.sprite;

                if (spriteKey && ['skeleton1', 'skeleton2', 'vampire'].includes(spriteKey)) {
                    target.play(`${spriteKey}_take_damage`, true);
                    target.once('animationcomplete', () => {
                        target.play(`${spriteKey}_idle`, true);
                    });
                } else {
                    target.setTint(0xff0000);
                    this.time.delayedCall(150, () => {
                        target.clearTint();
                    });
                }
            }

            const damageText = this.add.text(data.x, data.y - 20, data.damage.toString(), {
                fontSize: '24px',
                fontFamily: 'Impact, sans-serif',
                color: '#ff4444',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5);

            this.tweens.add({
                targets: damageText,
                y: data.y - 60,
                alpha: 0,
                duration: 800,
                ease: 'Power1',
                onComplete: () => damageText.destroy()
            });
        });

        this.room.onMessage("playerHealed", (data) => {
            const target = this.playerEntities[data.targetId];
            if (target) {
                target.setTint(0x00ff00);
                this.time.delayedCall(300, () => {
                    target.clearTint();
                });
                
                const healText = this.add.text(data.x, data.y - 20, `+${data.amount}`, {
                    fontSize: '24px',
                    fontFamily: 'Impact, sans-serif',
                    color: '#00ff00',
                    stroke: '#000000',
                    strokeThickness: 4
                }).setOrigin(0.5);

                this.tweens.add({
                    targets: healText,
                    y: data.y - 60,
                    alpha: 0,
                    duration: 1000,
                    ease: 'Power1',
                    onComplete: () => healText.destroy()
                });
            }
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
        
        const timeBoxEl = document.getElementById('time-box');
        if (timeBoxEl) {
            const time = this.room.state.timeLeft;
            const minutes = Math.floor(time / 60);
            const seconds = time % 60;
            if (minutes > 0) {
                timeBoxEl.innerText = `Time Left: ${minutes} min ${seconds} sec`;
            } else {
                timeBoxEl.innerText = `Time Left: ${seconds} sec`;
            }
        }

        const hudEl = document.getElementById('hud-box');
        if (hudEl) {
            let uiText = '';
            if (me) {
                uiText = `Health: ${me.health}<br/>Weapon: ${me.weaponId || 'None'}<br/>Ammo: ${me.ammo}`;
            }
            hudEl.innerHTML = uiText;
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
                const meEntity = this.playerEntities[this.room.sessionId];
                if (meEntity) {
                    const angle = Phaser.Math.Angle.Between(meEntity.x, meEntity.y, pointer.worldX, pointer.worldY);
                    this.room.send("attack", { angle: angle, targetX: pointer.worldX, targetY: pointer.worldY });
                } else {
                    this.room.send("attack", { angle: 0, targetX: pointer.worldX, targetY: pointer.worldY });
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
        
        const me = this.room.state.players?.get(this.room.sessionId);
        
        // Flamethrower continuous fire
        if (this.input.activePointer.leftButtonDown() && me && me.weaponId === 'flamethrower') {
            if (_time - this.lastFired > 100) { // Fire every 100ms
                this.lastFired = _time;
                const meEntity = this.playerEntities[this.room.sessionId];
                if (meEntity) {
                    const angle = Phaser.Math.Angle.Between(meEntity.x, meEntity.y, this.input.activePointer.worldX, this.input.activePointer.worldY);
                    this.room.send("attack", { angle: angle, targetX: this.input.activePointer.worldX, targetY: this.input.activePointer.worldY });
                }
            }
        }

        // Handle local input
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
                
                if (dx < 0) currentPlayer.flipX = true;
                else if (dx > 0) currentPlayer.flipX = false;
                
                if (['skeleton1', 'skeleton2', 'vampire'].includes(me.sprite)) {
                    currentPlayer.play(`${me.sprite}_movement`, true);
                }
                
                // Send the resulting physics position to the server
                this.room.send("move", { x: currentPlayer.x, y: currentPlayer.y });
            }
        } else {
            const currentPlayer = this.playerEntities[this.room.sessionId];
            if (currentPlayer) {
                currentPlayer.setVelocity(0, 0);
                if (['skeleton1', 'skeleton2', 'vampire'].includes(me.sprite)) {
                    if (!currentPlayer.getData('isDead') && currentPlayer.anims.currentAnim?.key !== `${me.sprite}_attack` && currentPlayer.anims.currentAnim?.key !== `${me.sprite}_take_damage`) {
                        currentPlayer.play(`${me.sprite}_idle`, true);
                    }
                }
            }
        }
    }
}
