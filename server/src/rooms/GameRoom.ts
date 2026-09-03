import { Room, Client } from "colyseus";
import { GameState, Player, WeaponDrop, Trap } from "../schema/GameState";
import { MapSchema } from "@colyseus/schema";
import { PLAYER_SPAWNS, WEAPON_SPAWNS, TRAP_SPAWNS } from "../shared/mapConfig";

export class GameRoom extends Room<any> {
    maxClients = 8;
    timerInterval: NodeJS.Timeout | null = null;
    weaponSpawnerInterval: NodeJS.Timeout | null = null;
    weaponIdCounter = 0;
    trapIdCounter = 0;

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
            if (attacker.ammo <= 0) {
                attacker.weaponId = "";
            }

            this.broadcast("playerAttacked", { playerId: client.sessionId });
            
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

                // Check spike trap damage
                this.state.traps.forEach((trap: Trap) => {
                    if (trap.active && trap.type === "spike") {
                        this.state.players.forEach((player: Player, sessionId: string) => {
                            if (player.health > 0 && !player.isImmune) {
                                const dist = Math.sqrt(Math.pow(player.x - trap.x, 2) + Math.pow(player.y - trap.y, 2));
                                if (dist < 25) { // 25 pixel radius for stepping on spikes
                                    player.health -= 15; // DOT or heavy hit
                                    this.broadcast("damageTaken", { targetId: sessionId, damage: 15, x: player.x, y: player.y });
                                    
                                    if (player.health <= 0) {
                                        this.handlePlayerDeath(sessionId, player);
                                    }
                                }
                            }
                        });
                    }
                });
                
            } else {
                this.state.gameEnded = true;
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.broadcast("gameOver", this.getWinner());
            }
        }, 1000);

        this.weaponSpawnerInterval = setInterval(() => {
            const maxDrops = Math.max(0, this.state.players.size - 1);
            if (!this.state.gameEnded && this.state.weaponDrops.size < maxDrops) {
                const drop = new WeaponDrop();
                const spawn = WEAPON_SPAWNS[Math.floor(Math.random() * WEAPON_SPAWNS.length)];
                drop.x = spawn.x;
                drop.y = spawn.y;
                drop.type = "sword";
                drop.ammo = 10;
                this.state.weaponDrops.set(`drop_${this.weaponIdCounter++}`, drop);
            }
        }, 20000); // 20 seconds interval
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
