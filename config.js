/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// =============================================================================
// FOAM STRIKE: TACTICAL FOAM-DART SHOOTER - CONFIGURATION
// 100% Data-Driven Game Balance, Ballistics, Weapons, Gadgets, Loot, and Maps.
// STRICT ARCHITECTURAL RULE: NO LOGIC HERE.
// =============================================================================

export const GLOBAL_CONFIG = {
  // Arena & Camera
  tickRate: 60,
  tileSize: 40,
  cameraMode: "follow",
  cameraLerp: 0.12,

  // Tactical High-TTK Player Core Stats
  playerRadius: 15,
  playerBaseHp: 100,
  playerBaseSpeed: 2.5, // px/tick
  weightSpeedPenaltyFactor: 0.04, // effectiveSpeed = baseSpeed * Math.max(minSpeedRatio, 1 - (weight * 0.04))
  minSpeedRatio: 0.45,
  maxLoadoutWeight: 12.0, // Max loadout limit (units)
  crouchSpeedMultiplier: 0.55,

  // Stamina & Front-Flip Mechanics
  maxStamina: 100,
  staminaRegenRate: 20, // per second (pauses during sprint / flip)
  sprintCost: 25, // stamina/sec
  sprintMultiplier: 1.2,
  flipCost: 50, // 50% of bar
  flipDurationMs: 350,
  flipSpeedMultiplier: 2.2,

  // Interaction & Scavenging
  groundScavengeRadius: 22, // px
  interactRadius: 38, // px
  respawnDelayMs: 3000,

  // Destructible Props
  boxMaxHp: 60,

  // Visual Theme Mode: 'tactical' (textured) or 'basic' (clean test playground)
  visualMode: "tactical",
};

export const AMMO_TYPES = {
  elite_dart: {
    name: "Elite Foam Dart",
    speed: 13,
    drag: 0.982,
    bounces: 0,
    radius: 3,
    length: 10,
    color: "#ff5500",
    tipColor: "#1e60ff",
    maxCarry: 1000,
    spawnWeight: 60,
  },
  rival_ball: {
    name: "Rival Foam Sphere",
    speed: 17,
    drag: 0.991,
    bounces: 3,
    radius: 5,
    length: 5,
    color: "#ffee00",
    tipColor: "#ffee00",
    maxCarry: 1000,
    spawnWeight: 40,
  },
};

export const WEAPONS = {
  jolt_pistol: {
    name: "Jolt Pistol",
    description: "1-Shot Pocket Blaster with manual spring prime",
    ammoType: "elite_dart",
    damage: 120,
    magSize: 1,
    fireCooldown: 1000,
    reloadTime: 3000,
    weight: 0.8,
    spread: 0.02,
    action: "springer", // Requires manual prime cooldown
    pellets: 1,
    spawnWeight: 35,
    rarity: "common",
    color: "#ff7700",
  },
  burst_sniper: {
    name: "Burst Sniper",
    description: "3-Shot Burst Marksman Tactical Rifle",
    ammoType: "elite_dart",
    damage: 20,
    magSize: 10,
    burstCount: 5,
    burstDelay: 0,
    fireCooldown: 500,
    reloadTime: 2000,
    weight: 4.2,
    spread: 0.8,
    pellets: 1,
    spawnWeight: 20,
    rarity: "rare",
    color: "#4488ff",
  },
  rival_smg: {
    name: "Rival SMG",
    description: "Flywheel High-Velocity SMG (Rev up with Right-Click)",
    ammoType: "rival_ball",
    damage: 8,
    magSize: 50,
    fireCooldown: 150,
    revUpTime: 350, // Must spin up flywheels before full auto
    reloadTime: 7500,
    weight: 3.5,
    spread: 0.25,
    pellets: 1,
    spawnWeight: 25,
    rarity: "rare",
    color: "#ffe100",
  },
  xshot_chaingun: {
    name: "X-Shot Chaingun",
    description: "Heavy Belt-Fed Chain Gun for suppression fire",
    ammoType: "elite_dart",
    damage: 3,
    magSize: 60,
    fireCooldown: 120,
    reloadTime: 3000,
    weight: 6.5, // Heavy movement penalty
    spread: 0.3,
    pellets: 1,
    spawnWeight: 15,
    rarity: "epic",
    color: "#aa44ff",
  },
  boffer_sword: {
    name: "Boffer Sword",
    description: "Tactical Foam Melee blade with massive knockback",
    isMelee: true,
    damage: 25,
    range: 42,
    arcAngle: 1.2,
    fireCooldown: 500,
    knockbackForce: 50,
    weight: 1.2,
    spawnWeight: 20,
    rarity: "uncommon",
    color: "#22cc88",
  },
  foam_grenade: {
    name: "Foam Grenade",
    description: "3-Second scatter frag explosive canister",
    isGadget: true,
    throwSpeed: 9,
    detonateDelay: 3000,
    shrapnelAmmoType: "elite_dart",
    shrapnelCount: 12,
    shrapnelSpeed: 8,
    shrapnelBounces: 2,
    weight: 1.0,
    spawnWeight: 40,
    rarity: "uncommon",
    color: "#ffaa00",
  },
  foam_claymore: {
    name: "Foam Claymore",
    description: "Directional proximity mine; front-flip to evade!",
    isGadget: true,
    isDeployable: true,
    proximityRadius: 100,
    coneAngle: 0.9,
    detonateDelay: 1000, // Trigger windup beep
    shrapnelAmmoType: "elite_dart",
    shrapnelCount: 10,
    shrapnelSpeed: 10,
    shrapnelBounces: 1,
    weight: 1.5,
    spawnWeight: 20,
    rarity: "rare",
    color: "#e63946",
  },
  nerf_nuke: {
    name: "Nerf Nuke",
    description: "Cluster device! Load 250 darts to throw. 5s Defuse window!",
    isGadget: true,
    requiresDartLoadCount: 100, // Player must scavenge/load 100 darts to arm
    throwSpeed: 5.5,
    detonateDelay: 3000, // 3.0 seconds visible ticking on floor
    canBeDefusedBeforeDetonation: false, // Any player pressing 'E' defuses/picks it up!
    shrapnelAmmoType: "elite_dart",
    shrapnelCount: 100,
    shrapnelSpeed: 8,
    shrapnelBounces: 5,
    weight: 5.0,
    spawnWeight: 8,
    rarity: "legendary",
    color: "#ff0055",
  },
};

export const LOOT_CONFIG = {
  weaponRespawnInterval: 180, // Seconds before weapon pad spawns new weapon
  ammoRespawnInterval: 20, // Seconds before ammo pad spawns new ammo
  initialRandomFloorChance: 0.08, // 4% chance per empty '.' tile at start
  ammoVsWeaponRatio: 0.80, // 80% ammo, 20% weapon on floor scatter
  maxFloorLootItems: 30,
  ammoSpawnCountMin: 5,
  ammoSpawnCountMax: 20,
};

export const MAPS = {
  living_room_warzone: [
    "####################",
    "#S..D.....=.....D.S#",
    "#...====..=..====..#",
    "#.........O.....W..#",
    "#..#OO#.......#OO#.#",
    "#..#OO#...D...#OO#.#",
    "#...W.....O........#",
    "#...====..=..====..#",
    "#S..D.....=.....D.S#",
    "####################",
  ],
  testing_playground: [
    "###################################################################################################",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "#.................................................................................................#",
    "###################################################################################################",
  ],
};
