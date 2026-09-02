import { Room, Client } from "colyseus";
import { GameState, Player, WeaponDrop } from "../schema/GameState";
import { MapSchema } from "@colyseus/schema";

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
            }
        });

        this.onMessage("attack", (client, message) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || this.state.gameEnded || attacker.ammo <= 0 || attacker.weaponId === "") return;

            attacker.ammo -= 1;
            
            // Basic combat: hit any player within 60 units (Zelda sword style)
            this.state.players.forEach((target: Player, targetId: string) => {
                if (targetId !== client.sessionId) {
                    const dist = Math.sqrt(Math.pow(attacker.x - target.x, 2) + Math.pow(attacker.y - target.y, 2));
                    if (dist < 60) {
                        target.health -= 25;
                        if (target.health <= 0) {
                            attacker.kills += 1;
                            // Respawn
                            target.health = 100;
                            target.x = Math.random() * 1200;
                            target.y = Math.random() * 1200;
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
            // Scarce weapon drops: max 3 on the map at once
            if (!this.state.gameEnded && this.state.weaponDrops.size < 3) {
                const drop = new WeaponDrop();
                drop.x = Math.random() * 1200;
                drop.y = Math.random() * 1200;
                drop.type = "sword";
                drop.ammo = 10;
                this.state.weaponDrops.set(`drop_${this.weaponIdCounter++}`, drop);
            }
        }, 20000); // 20 seconds interval
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        const player = new Player();
        // Spawn at a random position (adjust based on map size later)
        player.x = Math.random() * 1200;
        player.y = Math.random() * 1200;
        player.health = 100;
        player.kills = 0;
        player.weaponId = "";
        player.ammo = 0;
        this.state.players.set(client.sessionId, player);
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
