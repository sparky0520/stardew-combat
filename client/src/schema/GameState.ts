import { schema, t, type SchemaType } from '@colyseus/schema';

export const Player = schema({
    x: t.number(),
    y: t.number(),
    health: t.number(),
    kills: t.number(),
    weaponId: t.string(),
    ammo: t.number(),
    name: t.string(),
    sprite: t.string(),
    isImmune: t.boolean()
}, "Player");
export type Player = SchemaType<typeof Player>;

export const WeaponDrop = schema({
    x: t.number(),
    y: t.number(),
    type: t.string(),
    ammo: t.number()
}, "WeaponDrop");
export type WeaponDrop = SchemaType<typeof WeaponDrop>;

export const Trap = schema({
    x: t.number(),
    y: t.number(),
    type: t.string(),
    active: t.boolean()
}, "Trap");
export type Trap = SchemaType<typeof Trap>;

export const Projectile = schema({
    x: t.number(),
    y: t.number(),
    angle: t.number(),
    type: t.string(),
    ownerId: t.string()
}, "Projectile");
export type Projectile = SchemaType<typeof Projectile>;

export const GameState = schema({
    players: t.map(Player),
    weaponDrops: t.map(WeaponDrop),
    traps: t.map(Trap),
    projectiles: t.map(Projectile),
    timeLeft: t.number(),
    gameEnded: t.boolean()
}, "GameState");
export type GameState = SchemaType<typeof GameState>;
