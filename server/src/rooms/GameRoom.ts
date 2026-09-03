import { Room, Client } from "colyseus";
import { GameState, Player, WeaponDrop, Trap, Projectile, HealthPickup } from "../schema/GameState";
import { MapSchema } from "@colyseus/schema";
import { PLAYER_SPAWNS, WEAPON_SPAWNS, TRAP_SPAWNS, TORCH_SPAWNS, HEALTH_SPAWNS } from "../shared/mapConfig";

export class GameRoom extends Room<any> {
    maxClients = 8;
    timerInterval: NodeJS.Timeout | null = null;
    weaponSpawnerInterval: NodeJS.Timeout | null = null;
    healthSpawnerInterval: NodeJS.Timeout | null = null;
    torchInterval: NodeJS.Timeout | null = null;
    weaponIdCounter = 0;
    trapIdCounter = 0;
    projectileIdCounter = 0;
    private weaponBag: string[] = [];
    private lastSpikeHit: Map<string, number> = new Map();
    private lastPuddleHit: Map<string, number> = new Map();
    private flaskTargets: Map<string, {x: number, y: number}> = new Map();
    private torchAngles: Map<string, number> = new Map();

    private handlePlayerDeath(targetId: string, target: Player, killerClient?: Client, killerName?: string) {
        if (killerClient && killerName) {
            killerClient.send("killLog", { name: target.name });
        }
        target.health = 0;
        
        setTimeout(() => {
            if (this.state.players.has(targetId)) {
                const p = this.state.players.get(targetId)!;
                p.health = 100;
                const spawn = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
                p.x = spawn.x;
                p.y = spawn.y;
                p.isImmune = true;
                
                const targetClient = this.clients.find(c => c.sessionId === targetId);
                if (targetClient) {
                    targetClient.send("respawn", { x: p.x, y: p.y });
                }

                setTimeout(() => {
                    if (this.state.players.has(targetId)) {
                        this.state.players.get(targetId)!.isImmune = false;
                    }
                }, 5000);
            }
        }, 3000);
    }

    onCreate(options: any) {
        const state = new GameState();
        state.players = new MapSchema<Player>();
        state.weaponDrops = new MapSchema<WeaponDrop>();
        state.traps = new MapSchema<Trap>();
        state.projectiles = new MapSchema<Projectile>();
        state.healthPickups = new MapSchema<HealthPickup>();
        state.timeLeft = 300;
        state.gameEnded = false;
        this.setState(state);
        
        // Initialize Spikes at choke points
        TRAP_SPAWNS.forEach((spawn) => {
            const trap = new Trap();
            trap.x = spawn.x;
            trap.y = spawn.y;
            trap.type = "spike";
            trap.active = false;
            this.state.traps.set(`trap_${this.trapIdCounter++}`, trap);
        });

        // Initialize Wall Torches
        TORCH_SPAWNS.forEach((spawn) => {
            const trap = new Trap();
            trap.x = spawn.x;
            trap.y = spawn.y;
            trap.type = `torch_${spawn.wall}`;
            trap.active = true;
            const trapId = `trap_${this.trapIdCounter++}`;
            this.state.traps.set(trapId, trap);
            this.torchAngles.set(trapId, spawn.angle);
        });

        this.onMessage("move", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !this.state.gameEnded) {
                player.x = message.x;
                player.y = message.y;
            }
        });

        this.onMessage("pickup", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || this.state.gameEnded) return;

            let closestDropId = "";
            let minDistance = 100; 

            this.state.weaponDrops.forEach((drop: WeaponDrop, dropId: string) => {
                const dist = Math.sqrt(Math.pow(player.x - drop.x, 2) + Math.pow(player.y - drop.y, 2));
                if (dist < minDistance) {
                    minDistance = dist;
                    closestDropId = dropId;
                }
            });

            if (closestDropId) {
                const drop = this.state.weaponDrops.get(closestDropId)!;
                player.weaponId = drop.type;
                player.ammo = drop.ammo;
                this.state.weaponDrops.delete(closestDropId);
                this.broadcast("weaponTaken", { name: player.name });
            }
        });

        this.onMessage("attack", (client, message) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || this.state.gameEnded || attacker.ammo <= 0 || attacker.weaponId === "") return;

            attacker.ammo -= 1;
            const currentWeapon = attacker.weaponId;
            
            if (attacker.ammo <= 0) {
                attacker.weaponId = "";
            }

            this.broadcast("playerAttacked", { playerId: client.sessionId, weapon: currentWeapon, angle: message.angle || 0 });
            
            if (currentWeapon === "sword") {
                this.state.players.forEach((target: Player, targetId: string) => {
                    if (targetId !== client.sessionId) {
                        const dist = Math.sqrt(Math.pow(attacker.x - target.x, 2) + Math.pow(attacker.y - target.y, 2));
                        if (dist < 60 && target.health > 0 && !target.isImmune) {
                            target.health -= 25;
                            this.broadcast("damageTaken", { targetId: targetId, damage: 25, x: target.x, y: target.y });
                            if (target.health <= 0) {
                                attacker.kills += 1;
                                this.handlePlayerDeath(targetId, target, client, target.name);
                            }
                        }
                    }
                });
            } else if (currentWeapon === "bow") {
                const angle = message.angle || 0;
                const projectile = new Projectile();
                projectile.x = attacker.x;
                projectile.y = attacker.y;
                projectile.angle = angle;
                projectile.type = "arrow";
                projectile.ownerId = client.sessionId;
                this.state.projectiles.set(`proj_${this.projectileIdCounter++}`, projectile);
            } else if (currentWeapon === "flamethrower") {
                const angle = message.angle || 0;
                this.state.players.forEach((target: Player, targetId: string) => {
                    if (targetId !== client.sessionId) {
                        const dist = Math.sqrt(Math.pow(attacker.x - target.x, 2) + Math.pow(attacker.y - target.y, 2));
                        if (dist < 120 && target.health > 0 && !target.isImmune) {
                            let targetAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
                            let angleDiff = targetAngle - angle;
                            
                            // Normalize angle diff to -PI to PI
                            while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                            
                            if (Math.abs(angleDiff) < Math.PI / 4) { // 45 degree half-angle cone
                                target.health -= 8; // 8 damage per hit (fires rapidly)
                                this.broadcast("damageTaken", { targetId: targetId, damage: 8, x: target.x, y: target.y });
                                if (target.health <= 0) {
                                    attacker.kills += 1;
                                    this.handlePlayerDeath(targetId, target, client, target.name);
                                }
                            }
                        }
                    }
                });
            } else if (currentWeapon === "flask") {
                const angle = message.angle || 0;
                const projectile = new Projectile();
                projectile.x = attacker.x;
                projectile.y = attacker.y;
                projectile.angle = angle;
                projectile.type = "flask";
                projectile.ownerId = client.sessionId;
                const projId = `proj_${this.projectileIdCounter++}`;
                this.state.projectiles.set(projId, projectile);
                this.flaskTargets.set(projId, { x: message.targetX || attacker.x, y: message.targetY || attacker.y });
            }
        });

        // Start game timer and Trap logic
        this.timerInterval = setInterval(() => {
            if (this.state.timeLeft > 0) {
                this.state.timeLeft -= 1;
                
                // Toggle spike traps every 3 seconds
                if (this.state.timeLeft % 3 === 0) {
                    this.state.traps.forEach((trap: Trap) => {
                        if (trap.type === "spike") {
                            trap.active = !trap.active;
                        }
                    });
                }
                
            } else {
                this.state.gameEnded = true;
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.broadcast("gameOver", this.getWinner());
            }
        }, 1000);

        const spawnWeapon = () => {
            const maxDrops = 4; // Cap at 4 active weapon caches
            if (!this.state.gameEnded && this.state.weaponDrops.size < maxDrops) {
                const drop = new WeaponDrop();
                const spawn = WEAPON_SPAWNS[Math.floor(Math.random() * WEAPON_SPAWNS.length)];
                drop.x = spawn.x;
                drop.y = spawn.y;
                // Draw from a shuffled "bag" to ensure balanced weapon types
                if (this.weaponBag.length === 0) {
                    this.weaponBag = ["sword", "bow", "flamethrower", "flask"];
                    for (let i = this.weaponBag.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [this.weaponBag[i], this.weaponBag[j]] = [this.weaponBag[j], this.weaponBag[i]];
                    }
                }
                drop.type = this.weaponBag.pop()!;
                
                if (drop.type === "sword") drop.ammo = 10;
                else if (drop.type === "bow") drop.ammo = 5;
                else if (drop.type === "flamethrower") drop.ammo = 50; // High ammo for rapid fire
                else if (drop.type === "flask") drop.ammo = 3;
                
                this.state.weaponDrops.set(`drop_${this.weaponIdCounter++}`, drop);
            }
        };

        const spawnHealth = () => {
            const maxDrops = 4; // Always allow up to 4 health pickups
            if (!this.state.gameEnded && this.state.healthPickups.size < maxDrops) {
                const drop = new HealthPickup();
                const spawn = HEALTH_SPAWNS[Math.floor(Math.random() * HEALTH_SPAWNS.length)];
                drop.x = spawn.x;
                drop.y = spawn.y;
                
                this.state.healthPickups.set(`health_${this.weaponIdCounter++}`, drop); // Reusing weaponIdCounter for generic IDs
            }
        };

        // Spawn initial weapons and health
        spawnWeapon();
        spawnWeapon();
        spawnHealth();
        spawnHealth();

        this.weaponSpawnerInterval = setInterval(spawnWeapon, 20000); // 20 seconds interval
        this.healthSpawnerInterval = setInterval(spawnHealth, 20000); // 20 seconds interval

        // Periodic Fireball Shooting from Torches
        this.torchInterval = setInterval(() => {
            if (this.state.gameEnded) return;
            this.state.traps.forEach((trap: Trap, trapId: string) => {
                if (trap.type.startsWith("torch")) {
                    const angle = this.torchAngles.get(trapId);
                    if (angle !== undefined) {
                        const projectile = new Projectile();
                        projectile.x = trap.x;
                        projectile.y = trap.y;
                        projectile.angle = angle;
                        projectile.type = "fireball";
                        projectile.ownerId = "environment";
                        this.state.projectiles.set(`proj_${this.projectileIdCounter++}`, projectile);
                    }
                }
            });
        }, 2500); // Fireballs every 2.5 seconds

        // Fast simulation loop for projectiles
        this.setSimulationInterval((deltaTime) => {
            if (this.state.gameEnded) return;

            // Health Pickup Logic
            this.state.healthPickups.forEach((pickup: HealthPickup, pickupId: string) => {
                let pickedUp = false;
                this.state.players.forEach((player: Player, playerId: string) => {
                    if (!pickedUp && player.health > 0) {
                        const dist = Math.sqrt(Math.pow(player.x - pickup.x, 2) + Math.pow(player.y - pickup.y, 2));
                        if (dist < 25) { // Pickup radius
                            if (player.health < 100) {
                                player.health = Math.min(100, player.health + 25);
                                this.broadcast("playerHealed", { targetId: playerId, x: player.x, y: player.y, amount: 25 });
                            }
                            this.state.healthPickups.delete(pickupId);
                            pickedUp = true;
                        }
                    }
                });
            });

            const SPEED = 400; // pixels per second
            const distance = (SPEED * deltaTime) / 1000;
            const MAP_SIZE = 1280;

            this.state.projectiles.forEach((proj: Projectile, projId: string) => {
                if (proj.type === "flask") {
                    const target = this.flaskTargets.get(projId);
                    if (target) {
                        const distToTarget = Math.sqrt(Math.pow(target.x - proj.x, 2) + Math.pow(target.y - proj.y, 2));
                        if (distToTarget <= distance) {
                            this.state.projectiles.delete(projId);
                            this.flaskTargets.delete(projId);
                            
                            const puddle = new Trap();
                            puddle.x = target.x;
                            puddle.y = target.y;
                            puddle.type = "puddle";
                            puddle.active = true;
                            const trapId = `trap_${this.trapIdCounter++}`;
                            this.state.traps.set(trapId, puddle);
                            
                            setTimeout(() => {
                                if (this.state.traps.has(trapId)) {
                                    this.state.traps.delete(trapId);
                                }
                            }, 5000);
                            return;
                        }
                    }
                }
                
                proj.x += Math.cos(proj.angle) * distance;
                proj.y += Math.sin(proj.angle) * distance;

                if (proj.x < 0 || proj.x > MAP_SIZE || proj.y < 0 || proj.y > MAP_SIZE) {
                    this.state.projectiles.delete(projId);
                    this.flaskTargets.delete(projId);
                    return;
                }

                if (proj.type === "arrow" || proj.type === "fireball") {
                    let hit = false;
                    this.state.players.forEach((player: Player, playerId: string) => {
                        if (!hit && playerId !== proj.ownerId && player.health > 0 && !player.isImmune) {
                            const dist = Math.sqrt(Math.pow(player.x - proj.x, 2) + Math.pow(player.y - proj.y, 2));
                            if (dist < 20) { // Arrow/Fireball hit radius
                                hit = true;
                                const damage = proj.type === "fireball" ? 15 : 20;
                                player.health -= damage;
                                this.broadcast("damageTaken", { targetId: playerId, damage: damage, x: player.x, y: player.y });
                                if (player.health <= 0) {
                                    if (proj.ownerId !== "environment") {
                                        const owner = this.state.players.get(proj.ownerId);
                                        if (owner) owner.kills += 1;
                                        const ownerClient = this.clients.find(c => c.sessionId === proj.ownerId);
                                        this.handlePlayerDeath(playerId, player, ownerClient, player.name);
                                    } else {
                                        this.broadcast("killLog", { message: `${player.name} was incinerated by a fireball!` });
                                        this.handlePlayerDeath(playerId, player);
                                    }
                                }
                                this.state.projectiles.delete(projId);
                            }
                        }
                    });
                }
            });

            // Instant trap collision detection
            this.state.traps.forEach((trap: Trap) => {
                if (trap.active && trap.type === "spike") {
                    this.state.players.forEach((player: Player, sessionId: string) => {
                        if (player.health > 0 && !player.isImmune) {
                            const dist = Math.sqrt(Math.pow(player.x - trap.x, 2) + Math.pow(player.y - trap.y, 2));
                            if (dist < 25) {
                                const lastHit = this.lastSpikeHit.get(sessionId) || 0;
                                if (Date.now() - lastHit > 1000) { // 1 second cooldown
                                    this.lastSpikeHit.set(sessionId, Date.now());
                                    player.health -= 15;
                                    this.broadcast("damageTaken", { targetId: sessionId, damage: 15, x: player.x, y: player.y });
                                    
                                    if (player.health <= 0) {
                                        this.broadcast("killLog", { message: `${player.name} died to a Spike Trap!` });
                                        this.handlePlayerDeath(sessionId, player);
                                    }
                                }
                            }
                        }
                    });
                } else if (trap.active && trap.type === "puddle") {
                    this.state.players.forEach((player: Player, sessionId: string) => {
                        if (player.health > 0 && !player.isImmune) {
                            const dist = Math.sqrt(Math.pow(player.x - trap.x, 2) + Math.pow(player.y - trap.y, 2));
                            if (dist < 35) { // AOE puddle radius
                                const lastHit = this.lastPuddleHit.get(sessionId) || 0;
                                if (Date.now() - lastHit > 500) { // Damage tick every 0.5 seconds
                                    this.lastPuddleHit.set(sessionId, Date.now());
                                    player.health -= 10;
                                    this.broadcast("damageTaken", { targetId: sessionId, damage: 10, x: player.x, y: player.y });
                                    
                                    if (player.health <= 0) {
                                        this.broadcast("killLog", { message: `${player.name} melted in an acid puddle!` });
                                        this.handlePlayerDeath(sessionId, player);
                                    }
                                }
                            }
                        }
                    });
                }
            });
        });
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        const player = new Player();
        const spawn = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
        player.x = spawn.x;
        player.y = spawn.y;
        player.health = 100;
        player.kills = 0;
        player.weaponId = "";
        player.ammo = 0;
        player.name = options.name || "Unknown";
        player.sprite = options.sprite || "priest1";
        player.isImmune = true;
        this.state.players.set(client.sessionId, player);

        setTimeout(() => {
            if (this.state.players.has(client.sessionId)) {
                this.state.players.get(client.sessionId)!.isImmune = false;
            }
        }, 5000);
    }

    onLeave(client: Client, code?: number) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.weaponSpawnerInterval) clearInterval(this.weaponSpawnerInterval);
        if (this.healthSpawnerInterval) clearInterval(this.healthSpawnerInterval);
        if (this.torchInterval) clearInterval(this.torchInterval);
    }

    getWinner() {
        let maxKills = -1;
        let winnerId = "";
        this.state.players.forEach((player: Player, sessionId: string) => {
            if (player.kills > maxKills) {
                maxKills = player.kills;
                winnerId = sessionId;
            }
        });
        return { sessionId: winnerId, kills: maxKills };
    }
}
