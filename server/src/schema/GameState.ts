import { schema, t, type SchemaType } from '@colyseus/schema';

export const Player = schema({
    x: t.number(),
    y: t.number(),
    health: t.number(),
    kills: t.number(),
    weaponId: t.string(),
    ammo: t.number()
}, "Player");
export type Player = SchemaType<typeof Player>;

export const WeaponDrop = schema({
    x: t.number(),
    y: t.number(),
    type: t.string(),
    ammo: t.number()
}, "WeaponDrop");
export type WeaponDrop = SchemaType<typeof WeaponDrop>;

export const GameState = schema({
    players: t.map(Player),
    weaponDrops: t.map(WeaponDrop),
    timeLeft: t.number(),
    gameEnded: t.boolean()
}, "GameState");
export type GameState = SchemaType<typeof GameState>;
