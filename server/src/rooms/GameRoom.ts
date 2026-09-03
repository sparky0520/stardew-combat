import { Room, Client } from "colyseus";
import { GameState, Player, WeaponDrop } from "../schema/GameState";
import { MapSchema } from "@colyseus/schema";
import { PLAYER_SPAWNS, WEAPON_SPAWNS } from "../shared/mapConfig";

export class GameRoom extends Room<any> {
    maxClients = 8;
    timerInterval: NodeJS.Timeout | null = null;
    weaponSpawnerInterval: NodeJS.Timeout | null = null;
    weaponIdCounter = 0;

    onCreate(options: any) {
        const state = new GameState();
        state.players = new MapSchema<Player>();
        state.weaponDrops = new MapSchema<WeaponDrop>();
        state.timeLeft = 300;
        state.gameEnded = false;
        this.setState(state);
        
        this.onMessage("move", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !this.state.gameEnded) {
                // In a real authoritative game, we would validate movement and collisions here.
                // For this prototype, we accept the client's position to keep it simple.
                player.x = message.x;
                player.y = message.y;
            }
        });

        this.onMessage("pickup", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || this.state.gameEnded) return;

            // Find closest weapon drop
            let closestDropId = "";
            let minDistance = 50; // pickup radius

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
            
            // Basic combat: hit any player within 60 units (Zelda sword style)
            this.state.players.forEach((target: Player, targetId: string) => {
                if (targetId !== client.sessionId) {
                    const dist = Math.sqrt(Math.pow(attacker.x - target.x, 2) + Math.pow(attacker.y - target.y, 2));
                    if (dist < 60 && target.health > 0 && !target.isImmune) {
                        target.health -= 25;
                        this.broadcast("damageTaken", { targetId: targetId, damage: 25, x: target.x, y: target.y });
                        if (target.health <= 0) {
                            attacker.kills += 1;
                            client.send("killLog", { name: target.name });
                            // Set to 0 so client knows they are dead
                            target.health = 0;
                            // Respawn after 3 seconds
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
                    }
                }
            });
        });

        // Start game timer
        this.timerInterval = setInterval(() => {
            if (this.state.timeLeft > 0) {
                this.state.timeLeft -= 1;
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
