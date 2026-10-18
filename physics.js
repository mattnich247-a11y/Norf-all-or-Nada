/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// =============================================================================
// FOAM STRIKE: TACTICAL FOAM-DART SHOOTER - PHYSICS ENGINE
// Pure State Update Loop, Two-Stage Ballistics, Scavenging, Flips, Loot & Collisions
// STRICT ARCHITECTURAL RULE: DATA-DRIVEN COMPOSABLE ENGINE (NO HARDCODED WEAPON NAMES)
// =============================================================================

import { GLOBAL_CONFIG, AMMO_TYPES, WEAPONS, LOOT_CONFIG, MAPS } from "./config.js";

// === SECTION: WEIGHTED_LOOT START ===
/**
 * Picks an item key from a dictionary based on its spawnWeight property.
 * @param {Record<string, { spawnWeight?: number }>} dictionary
 * @returns {string|null}
 */
export function pickWeightedItem(dictionary) {
  const entries = Object.entries(dictionary).filter(
    ([, item]) => typeof item.spawnWeight === "number" && item.spawnWeight > 0
  );
  if (entries.length === 0) return null;

  const totalWeight = entries.reduce((sum, [, item]) => sum + item.spawnWeight, 0);
  let roll = Math.random() * totalWeight;

  for (const [key, item] of entries) {
    if (roll < item.spawnWeight) {
      return key;
    }
    roll -= item.spawnWeight;
  }
  return entries[entries.length - 1][0];
}
// === SECTION: WEIGHTED_LOOT END ===

// === SECTION: ASCII_MAP_PARSER START ===
/**
 * Parses an ASCII map string array into structured tiles, spawn points, and destructibles.
 * @param {string[]} mapLines
 * @returns {{ width: number, height: number, tiles: string[][], spawns: {x: number, y: number}[], boxes: Map<string, {x: number, y: number, hp: number}>, weaponPads: {x: number, y: number, respawnTimer: number, currentItem: any}[], ammoPads: {x: number, y: number, respawnTimer: number, currentItem: any}[] }}
 */
export function parseMap(mapLines) {
  const height = mapLines.length;
  const width = mapLines[0].length;
  const tiles = [];
  const spawns = [];
  const boxes = new Map();
  const weaponPads = [];
  const ammoPads = [];

  for (let r = 0; r < height; r++) {
    tiles[r] = [];
    const line = mapLines[r];
    for (let c = 0; c < width; c++) {
      const char = line[c] || " ";
      const worldX = c * GLOBAL_CONFIG.tileSize + GLOBAL_CONFIG.tileSize / 2;
      const worldY = r * GLOBAL_CONFIG.tileSize + GLOBAL_CONFIG.tileSize / 2;

      if (char === "#") {
        tiles[r][c] = "#"; // Solid wall
      } else if (char === "=") {
        tiles[r][c] = "="; // Couch / Half-cover
      } else if (char === "O") {
        tiles[r][c] = "O"; // Cardboard box
        const boxKey = `${r}_${c}`;
        boxes.set(boxKey, { r, c, x: worldX, y: worldY, hp: GLOBAL_CONFIG.boxMaxHp });
      } else if (char === "S") {
        tiles[r][c] = "."; // Spawn point (floor)
        spawns.push({ x: worldX, y: worldY });
      } else if (char === "W") {
        tiles[r][c] = "."; // Weapon pad floor
        weaponPads.push({
          x: worldX,
          y: worldY,
          r,
          c,
          respawnTimer: 0,
          currentItem: null,
        });
      } else if (char === "D") {
        tiles[r][c] = "."; // Ammo pile floor
        ammoPads.push({
          x: worldX,
          y: worldY,
          r,
          c,
          respawnTimer: 0,
          currentItem: null,
        });
      } else {
        tiles[r][c] = "."; // Regular passable floor
      }
    }
  }

  return {
    width,
    height,
    pixelWidth: width * GLOBAL_CONFIG.tileSize,
    pixelHeight: height * GLOBAL_CONFIG.tileSize,
    tiles,
    spawns,
    boxes,
    weaponPads,
    ammoPads,
  };
}
// === SECTION: ASCII_MAP_PARSER END ===

// === SECTION: INITIAL_STATE START ===
/**
 * Creates a brand new authoritative game state object.
 * @param {string} [mapName="living_room_warzone"]
 * @returns {object}
 */
export function createInitialGameState(mapName = "living_room_warzone") {
  const mapData = parseMap(MAPS[mapName] || MAPS.living_room_warzone);

  const state = {
    tick: 0,
    map: mapData,
    players: new Map(), // playerId -> PlayerState
    projectiles: [], // Unified airborne and grounded projectiles
    floorLoot: [], // Pickups: weapons, ammo piles, deployed claymores, ticking nukes
    events: [], // Transient sound / hit / explosion events for client render & audio
    nextEntityId: 100,
  };

  // Populate map pads and random scatter
  seedMapLoot(state);

  return state;
}

/**
 * Seeds initial floor loot and pads.
 * @param {object} state
 */
export function seedMapLoot(state) {
  const { map } = state;

  // 1. Weapon Pads
  for (const pad of map.weaponPads) {
    const weaponKey = pickWeightedItem(WEAPONS);
    if (weaponKey) {
      const weaponDef = WEAPONS[weaponKey];
      const lootId = `pad_w_${state.nextEntityId++}`;
      const item = {
        id: lootId,
        x: pad.x,
        y: pad.y,
        type: "weapon",
        weaponKey,
        magAmmo: weaponDef.magSize || 1,
        padType: "weapon",
        padIndex: map.weaponPads.indexOf(pad),
      };
      pad.currentItem = item;
      state.floorLoot.push(item);
    }
  }

  // 2. Ammo Pads
  for (const pad of map.ammoPads) {
    const ammoKey = pickWeightedItem(AMMO_TYPES);
    if (ammoKey) {
      const min = LOOT_CONFIG.ammoSpawnCountMin;
      const max = LOOT_CONFIG.ammoSpawnCountMax;
      const count = Math.floor(min + Math.random() * (max - min + 1));
      const lootId = `pad_d_${state.nextEntityId++}`;
      const item = {
        id: lootId,
        x: pad.x,
        y: pad.y,
        type: "ammo",
        ammoType: ammoKey,
        count,
        padType: "ammo",
        padIndex: map.ammoPads.indexOf(pad),
      };
      pad.currentItem = item;
      state.floorLoot.push(item);
    }
  }

  // 3. Random Floor Scatter on '.' tiles
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      if (map.tiles[r][c] === ".") {
        // Skip spawn pads or tiles close to spawns
        const isSpawn = map.spawns.some(
          (s) => Math.hypot(s.x - (c * 40 + 20), s.y - (r * 40 + 20)) < 30
        );
        if (isSpawn) continue;

        if (Math.random() < LOOT_CONFIG.initialRandomFloorChance) {
          if (state.floorLoot.length >= LOOT_CONFIG.maxFloorLootItems) break;

          const isAmmo = Math.random() < LOOT_CONFIG.ammoVsWeaponRatio;
          const x = c * GLOBAL_CONFIG.tileSize + 100 + Math.random() * 20;
          const y = r * GLOBAL_CONFIG.tileSize + 100 + Math.random() * 20;

          if (isAmmo) {
            const ammoKey = pickWeightedItem(AMMO_TYPES);
            if (ammoKey) {
              const count = Math.floor(5 + Math.random() * 15);
              state.floorLoot.push({
                id: `scatter_${state.nextEntityId++}`,
                x,
                y,
                type: "ammo",
                ammoType: ammoKey,
                count,
              });
            }
          } else {
            const weaponKey = pickWeightedItem(WEAPONS);
            if (weaponKey) {
              const weaponDef = WEAPONS[weaponKey];
              state.floorLoot.push({
                id: `scatter_${state.nextEntityId++}`,
                x,
                y,
                type: "weapon",
                weaponKey,
                magAmmo: weaponDef.magSize || 1,
              });
            }
          }
        }
      }
    }
  }
}
// === SECTION: INITIAL_STATE END ===

// === SECTION: PLAYER_LIFECYCLE START ===
/**
 * Spawns or respawns a player entity with default or chosen loadout.
 * @param {object} state
 * @param {string} id
 * @param {string} name
 * @param {string} [primaryWeapon="jolt_pistol"]
 * @param {string} [secondaryGadget="foam_grenade"]
 * @returns {object}
 */
export function spawnPlayer(state, id, name = "Player", primaryWeapon = "jolt_pistol", secondaryGadget = "foam_grenade") {
  const spawns = state.map.spawns;
  const spawnPos = spawns.length > 0 ? spawns[Math.floor(Math.random() * spawns.length)] : { x: 80, y: 80 };

  const weapons = [primaryWeapon, secondaryGadget].filter(Boolean);
  const player = {
    id,
    name,
    x: spawnPos.x,
    y: spawnPos.y,
    vx: 0,
    vy: 0,
    aimAngle: 0,
    hp: GLOBAL_CONFIG.playerBaseHp,
    maxHp: GLOBAL_CONFIG.playerBaseHp,
    stamina: GLOBAL_CONFIG.maxStamina,
    maxStamina: GLOBAL_CONFIG.maxStamina,

    // Loadout & Weapons
    weapons,
    activeSlot: 0, // index in weapons
    magAmmo: {}, // weaponKey -> current loaded
    reserveAmmo: {
      elite_dart: 40,
      rival_ball: 60,
    },

    // Action & Cooldown timers (in ms)
    fireCooldownMs: 0,
    reloadTimerMs: 0,
    isReloading: false,
    revProgressMs: 0, // Flywheel spinup tracking
    burstRemaining: 0,
    burstTimerMs: 0,
    burstTargetAngle: 0,

    // Front Flip Mechanics
    isFlipping: false,
    flipTimerMs: 0,
    flipAngle: 0,

    // Status states
    isCrouching: false,
    isSprinting: false,
    isTaggedOut: false,
    respawnTimerMs: 0,
    score: 0,
    tagsDealt: 0,
    color: id === "host" || id.startsWith("p_") ? "#ff4757" : "#2ed573",
  };

  // Initialize magazines
  for (const wKey of player.weapons) {
    const wDef = WEAPONS[wKey];
    player.magAmmo[wKey] = wDef ? (wDef.magSize || 1) : 1;
  }

  state.players.set(id, player);
  return player;
}

/**
 * Calculates current loadout weight and effective movement speed.
 * @param {object} player
 * @returns {{ totalWeight: number, effectiveSpeed: number }}
 */
export function getPlayerMobility(player) {
  let totalWeight = 0;
  for (const wKey of player.weapons) {
    const wDef = WEAPONS[wKey];
    if (wDef && typeof wDef.weight === "number") {
      totalWeight += wDef.weight;
    }
  }

  // Weight penalty formula: effectiveSpeed = baseSpeed * Math.max(0.45, 1 - (totalLoadoutWeight * 0.04))
  const factor = Math.max(
    GLOBAL_CONFIG.minSpeedRatio,
    1 - totalWeight * GLOBAL_CONFIG.weightSpeedPenaltyFactor
  );
  let effectiveSpeed = GLOBAL_CONFIG.playerBaseSpeed * factor;

  if (player.isCrouching && !player.isFlipping) {
    effectiveSpeed *= GLOBAL_CONFIG.crouchSpeedMultiplier;
  } else if (player.isSprinting && !player.isFlipping && player.stamina > 0) {
    effectiveSpeed *= GLOBAL_CONFIG.sprintMultiplier;
  }

  return { totalWeight, effectiveSpeed };
}
// === SECTION: PLAYER_LIFECYCLE END ===

// === SECTION: WEAPON_INTERPRETER START ===
/**
 * Universal Data-Driven Weapon and Gadget interpreter.
 * Evaluates modular flags from config.js without hardcoded weapon names.
 * @param {object} state
 * @param {object} player
 * @param {boolean} triggerPressed
 * @param {boolean} revPressed
 * @param {boolean} reloadPressed
 * @param {number} dtMs
 */
export function handlePlayerBlaster(state, player, triggerPressed, revPressed, reloadPressed, dtMs) {
  if (player.isTaggedOut || player.isFlipping) return;

  const currentWeaponKey = player.weapons[player.activeSlot];
  const weapon = WEAPONS[currentWeaponKey];
  if (!weapon) return;

  // 1. Tick Cooldowns
  if (player.fireCooldownMs > 0) {
    player.fireCooldownMs = Math.max(0, player.fireCooldownMs - dtMs);
  }

  // 2. Handle Reloading
  if (player.isReloading) {
    player.reloadTimerMs -= dtMs;
    if (player.reloadTimerMs <= 0) {
      player.isReloading = false;
      const ammoType = weapon.ammoType;
      const magSize = weapon.magSize || 1;
      const currentInMag = player.magAmmo[currentWeaponKey] || 0;
      const needed = magSize - currentInMag;

      if (ammoType && player.reserveAmmo[ammoType] !== undefined) {
        const toLoad = Math.min(needed, player.reserveAmmo[ammoType]);
        player.magAmmo[currentWeaponKey] = currentInMag + toLoad;
        player.reserveAmmo[ammoType] -= toLoad;
        state.events.push({
          type: "reload_complete",
          x: player.x,
          y: player.y,
          playerId: player.id,
        });
      }
    }
    return; // Cannot fire while reloading
  }

  // Manual Reload Trigger
  if (reloadPressed && !weapon.isMelee && !weapon.isGadget) {
    const magSize = weapon.magSize || 1;
    const currentInMag = player.magAmmo[currentWeaponKey] || 0;
    const ammoType = weapon.ammoType;
    if (currentInMag < magSize && player.reserveAmmo[ammoType] > 0) {
      player.isReloading = true;
      player.reloadTimerMs = weapon.reloadTime || 1200;
      state.events.push({
        type: "reload_start",
        x: player.x,
        y: player.y,
        playerId: player.id,
      });
      return;
    }
  }

  // 3. Handle Flywheel Rev-Up Mechanic
  if (weapon.revUpTime && weapon.revUpTime > 0) {
    if (revPressed || triggerPressed) {
      player.revProgressMs = Math.min(weapon.revUpTime, player.revProgressMs + dtMs);
    } else {
      player.revProgressMs = Math.max(0, player.revProgressMs - dtMs * 1.5);
    }
  } else {
    player.revProgressMs = 0;
  }

  // 4. Handle Ongoing Bursts
  if (player.burstRemaining > 0) {
    player.burstTimerMs -= dtMs;
    if (player.burstTimerMs <= 0) {
      fireSingleShot(state, player, weapon, player.burstTargetAngle);
      player.burstRemaining--;
      player.burstTimerMs = weapon.burstDelay || 65;
    }
    return;
  }

  // 5. Fire Evaluation
  if (!triggerPressed) return;
  if (player.fireCooldownMs > 0) return;

  // Check flywheel rev-up requirement
  if (weapon.revUpTime && player.revProgressMs < weapon.revUpTime) {
    return; // Flywheels not up to full speed yet!
  }

  // Check Melee Flag
  if (weapon.isMelee) {
    executeMeleeAttack(state, player, weapon);
    player.fireCooldownMs = weapon.fireCooldown || 450;
    return;
  }

  // Check Gadget Flag (Deployable vs Thrown)
  if (weapon.isGadget) {
    executeGadgetAction(state, player, weapon, currentWeaponKey);
    player.fireCooldownMs = weapon.fireCooldown || 800;
    return;
  }

  // Standard Blaster Shooting
  const currentInMag = player.magAmmo[currentWeaponKey] || 0;
  if (currentInMag <= 0) {
    // Auto-reload on dry fire if reserve has ammo
    const ammoType = weapon.ammoType;
    if (player.reserveAmmo[ammoType] > 0) {
      player.isReloading = true;
      player.reloadTimerMs = weapon.reloadTime || 1200;
      state.events.push({
        type: "dry_fire_reload",
        x: player.x,
        y: player.y,
        playerId: player.id,
      });
    } else {
      state.events.push({
        type: "empty_click",
        x: player.x,
        y: player.y,
        playerId: player.id,
      });
      player.fireCooldownMs = 300;
    }
    return;
  }

  // Fire first round of burst or standard shot
  if (weapon.burstCount && weapon.burstCount > 1) {
    player.burstRemaining = Math.min(weapon.burstCount - 1, currentInMag - 1);
    player.burstTimerMs = weapon.burstDelay || 65;
    player.burstTargetAngle = player.aimAngle;
  }

  fireSingleShot(state, player, weapon, player.aimAngle);
  player.magAmmo[currentWeaponKey] = Math.max(0, currentInMag - 1);
  player.fireCooldownMs = weapon.fireCooldown || 400;

  // Springer action prime delay sound
  if (weapon.action === "springer") {
    state.events.push({
      type: "spring_prime",
      x: player.x,
      y: player.y,
      delayMs: weapon.fireCooldown * 0.5,
    });
  }
}

/**
 * Fires a single round (or multiple pellets) of the weapon.
 * @param {object} state
 * @param {object} player
 * @param {object} weapon
 * @param {number} baseAngle
 */
function fireSingleShot(state, player, weapon, baseAngle) {
  const ammoDef = AMMO_TYPES[weapon.ammoType] || AMMO_TYPES.elite_dart;
  const pelletCount = weapon.pellets || 1;
  const barrelLength = 18;

  const startX = player.x + Math.cos(baseAngle) * barrelLength;
  const startY = player.y + Math.sin(baseAngle) * barrelLength;

  for (let i = 0; i < pelletCount; i++) {
    const spreadOffset = (Math.random() - 0.5) * (weapon.spread || 0.05);
    const angle = baseAngle + spreadOffset;
    const speed = ammoDef.speed || 14;

    state.projectiles.push({
      id: `proj_${state.nextEntityId++}`,
      shooterId: player.id,
      ammoType: weapon.ammoType,
      damage: weapon.damage || 5,
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: ammoDef.drag || 0.985,
      bouncesLeft: ammoDef.bounces || 0,
      radius: ammoDef.radius || 3,
      length: ammoDef.length || 10,
      color: ammoDef.color || "#ff5500",
      tipColor: ammoDef.tipColor || "#2277ff",
      state: "airborne", // Two-stage foam ballistics: 'airborne' -> 'grounded'
      lifeTicks: 0,
    });
  }

  state.events.push({
    type: "blaster_fire",
    ammoType: weapon.ammoType,
    weaponName: weapon.name,
    x: startX,
    y: startY,
    angle: baseAngle,
  });
}

/**
 * Executes a foam melee sweep attack (e.g. Boffer Sword).
 * @param {object} state
 * @param {object} player
 * @param {object} weapon
 */
function executeMeleeAttack(state, player, weapon) {
  const range = weapon.range || 42;
  const arc = weapon.arcAngle || 1.2;
  const damage = weapon.damage || 20;
  const knockback = weapon.knockbackForce || 16;

  state.events.push({
    type: "melee_slash",
    x: player.x,
    y: player.y,
    angle: player.aimAngle,
    range,
    arc,
  });

  // Check players in melee arc
  for (const target of state.players.values()) {
    if (target.id === player.id || target.isTaggedOut) continue;

    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= range + GLOBAL_CONFIG.playerRadius) {
      let angleToTarget = Math.atan2(dy, dx) - player.aimAngle;
      // Normalize angle to [-PI, PI]
      angleToTarget = Math.atan2(Math.sin(angleToTarget), Math.cos(angleToTarget));

      if (Math.abs(angleToTarget) <= arc / 2) {
        // Tag player
        applyDamageToPlayer(state, target, damage, player.id);
        const kbDir = Math.atan2(dy, dx);
        target.vx += Math.cos(kbDir) * knockback;
        target.vy += Math.sin(kbDir) * knockback;

        state.events.push({
          type: "melee_hit",
          x: target.x,
          y: target.y,
          targetId: target.id,
        });
      }
    }
  }

  // Damage nearby cardboard boxes
  for (const box of state.map.boxes.values()) {
    if (box.hp <= 0) continue;
    const dist = Math.hypot(box.x - player.x, box.y - player.y);
    if (dist <= range + GLOBAL_CONFIG.tileSize / 2) {
      box.hp -= damage;
      if (box.hp <= 0) {
        destroyCardboardBox(state, box);
      }
    }
  }
}

/**
 * Handles Gadget actions: Directional Deployables (Claymores), Thrown Frag Grenades, and Nerf Nuke.
 * @param {object} state
 * @param {object} player
 * @param {object} weapon
 * @param {string} weaponKey
 */
function executeGadgetAction(state, player, weapon, weaponKey) {
  // Check if gadget requires pre-loaded dart count (e.g. Nerf Nuke requires 250 darts)
  if (weapon.requiresDartLoadCount && weapon.requiresDartLoadCount > 0) {
    const required = weapon.requiresDartLoadCount;
    const ammoType = weapon.shrapnelAmmoType || "elite_dart";
    const available = player.reserveAmmo[ammoType] || 0;

    if (available < required) {
      state.events.push({
        type: "nuke_not_enough_darts",
        playerId: player.id,
        required,
        available,
        x: player.x,
        y: player.y,
      });
      return;
    }

    // Deduct loaded darts to arm the device
    player.reserveAmmo[ammoType] -= required;
  }

  // Deployable Mine (e.g. Claymore)
  if (weapon.isDeployable) {
    const gadget = {
      id: `claymore_${state.nextEntityId++}`,
      type: "claymore",
      ownerId: player.id,
      x: player.x + Math.cos(player.aimAngle) * 20,
      y: player.y + Math.sin(player.aimAngle) * 20,
      facingAngle: player.aimAngle,
      proximityRadius: weapon.proximityRadius || 55,
      coneAngle: weapon.coneAngle || 0.9,
      armed: false,
      armTimerMs: 800,
      detonating: false,
      detonateTimerMs: weapon.detonateDelay || 200,
      shrapnelAmmoType: weapon.shrapnelAmmoType || "elite_dart",
      shrapnelCount: weapon.shrapnelCount || 10,
      shrapnelSpeed: weapon.shrapnelSpeed || 10,
      shrapnelBounces: weapon.shrapnelBounces || 1,
    };
    state.floorLoot.push(gadget);
    consumeGadgetFromInventory(player, weaponKey);

    state.events.push({
      type: "deploy_claymore",
      x: gadget.x,
      y: gadget.y,
    });
    return;
  }

  // Thrown Explosive / Cluster Device (Grenade or Nerf Nuke)
  const throwSpeed = weapon.throwSpeed || 8;
  const thrownItem = {
    id: `thrown_${state.nextEntityId++}`,
    type: weapon.canBeDefusedBeforeDetonation ? "nerf_nuke" : "grenade",
    ownerId: player.id,
    x: player.x + Math.cos(player.aimAngle) * 20,
    y: player.y + Math.sin(player.aimAngle) * 20,
    vx: Math.cos(player.aimAngle) * throwSpeed,
    vy: Math.sin(player.aimAngle) * throwSpeed,
    timerMs: weapon.detonateDelay || 3000,
    totalTimerMs: weapon.detonateDelay || 3000,
    canBeDefused: !!weapon.canBeDefusedBeforeDetonation,
    shrapnelAmmoType: weapon.shrapnelAmmoType || "elite_dart",
    shrapnelCount: weapon.shrapnelCount || 12,
    shrapnelSpeed: weapon.shrapnelSpeed || 8,
    shrapnelBounces: weapon.shrapnelBounces || 1,
    defused: false,
  };

  state.floorLoot.push(thrownItem);
  consumeGadgetFromInventory(player, weaponKey);

  state.events.push({
    type: "throw_gadget",
    gadgetType: thrownItem.type,
    x: thrownItem.x,
    y: thrownItem.y,
  });
}

/**
 * Removes or reduces quantity of single-use gadget from inventory.
 * @param {object} player
 * @param {string} weaponKey
 */
function consumeGadgetFromInventory(player, weaponKey) {
  // If player has another weapon, switch to it, or drop slot
  const idx = player.weapons.indexOf(weaponKey);
  if (idx !== -1) {
    player.weapons.splice(idx, 1);
    if (player.weapons.length === 0) {
      player.weapons.push("jolt_pistol");
      player.magAmmo["jolt_pistol"] = 1;
    }
    player.activeSlot = Math.min(player.activeSlot, player.weapons.length - 1);
  }
}
// === SECTION: WEAPON_INTERPRETER END ===

// === SECTION: BALLISTICS_AND_SCAVENGING START ===
/**
 * Updates two-stage foam ballistics, wall bounces, box damage, and floor dart scavenging.
 * Projectiles NEVER disappear when they stop moving; they transition from 'airborne' to 'grounded'.
 * @param {object} state
 * @param {number} dtMs
 */
export function updateBallisticsAndScavenging(state, dtMs) {
  const { map, projectiles, players } = state;
  const tileSize = GLOBAL_CONFIG.tileSize;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    // ==========================================
    // STAGE 1: AIRBORNE FOAM BALLISTICS
    // ==========================================
    if (p.state === "airborne") {
      p.lifeTicks++;

      // 1. Move by velocity vector
      p.x += p.vx;
      p.y += p.vy;

      // 2. Apply aerodynamic drag
      p.vx *= p.drag;
      p.vy *= p.drag;

      const speed = Math.hypot(p.vx, p.vy);

      // Check transition to grounded state
      if (speed < 0.4) {
        p.vx = 0;
        p.vy = 0;
        p.state = "grounded";
        continue;
      }

      // 3. Collision with Arena Walls & Props
      const tileC = Math.floor(p.x / tileSize);
      const tileR = Math.floor(p.y / tileSize);

      if (tileR < 0 || tileR >= map.height || tileC < 0 || tileC >= map.width) {
        p.vx = 0;
        p.vy = 0;
        p.state = "grounded";
        continue;
      }

      const tile = map.tiles[tileR][tileC];

      // Solid Wall (#) Collision
      if (tile === "#") {
        if (p.bouncesLeft > 0) {
          // Reflect velocity off nearest wall normal
          const prevX = p.x - p.vx;
          const prevY = p.y - p.vy;
          const prevC = Math.floor(prevX / tileSize);
          const prevR = Math.floor(prevY / tileSize);

          if (prevC !== tileC) p.vx = -p.vx;
          if (prevR !== tileR) p.vy = -p.vy;
          p.bouncesLeft--;

          state.events.push({
            type: "dart_bounce",
            x: p.x,
            y: p.y,
            ammoType: p.ammoType,
          });
        } else {
          // Ricochet halt: dart drops straight to the floor
          p.x -= p.vx;
          p.y -= p.vy;
          p.vx = 0;
          p.vy = 0;
          p.state = "grounded";
          continue;
        }
      }

      // Cardboard Box (O) Collision
      if (tile === "O") {
        const boxKey = `${tileR}_${tileC}`;
        const box = map.boxes.get(boxKey);
        if (box && box.hp > 0) {
          box.hp -= p.damage;
          state.events.push({
            type: "box_hit",
            x: p.x,
            y: p.y,
            hp: box.hp,
          });

          if (box.hp <= 0) {
            destroyCardboardBox(state, box);
          }

          // Darts lose momentum upon cardboard impact
          if (p.bouncesLeft > 0) {
            p.vx = -p.vx * 0.5;
            p.vy = -p.vy * 0.5;
            p.bouncesLeft--;
          } else {
            p.vx = 0;
            p.vy = 0;
            p.state = "grounded";
            continue;
          }
        }
      }

      // Half-Cover (=) Rule: Airborne darts fly over '=' unless target is crouching behind it!
      // (Evaluated during player hit check below)

      // 4. Player Hit Check
      for (const player of players.values()) {
        if (player.isTaggedOut) continue;
        // Prevent hitting shooter during initial barrel exit
        if (player.id === p.shooterId && p.lifeTicks < 4) continue;

        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist <= GLOBAL_CONFIG.playerRadius + p.radius) {
          // Check if player is protected by half-cover crouch
          const pTileR = Math.floor(player.y / tileSize);
          const pTileC = Math.floor(player.x / tileSize);
          const onHalfCover = map.tiles[pTileR]?.[pTileC] === "=";

          if (onHalfCover && player.isCrouching) {
            // Protected by ducking behind couch!
            p.vx = -p.vx * 0.3;
            p.vy = -p.vy * 0.3;
            p.bouncesLeft = 0;
            p.state = "grounded";
            state.events.push({
              type: "couch_cover_deflect",
              x: p.x,
              y: p.y,
            });
            break;
          }

          // Direct Hit!
          applyDamageToPlayer(state, player, p.damage, p.shooterId);

          state.events.push({
            type: "player_tagged",
            x: player.x,
            y: player.y,
            damage: p.damage,
            playerId: player.id,
            shooterId: p.shooterId,
          });

          // Dart drops to the floor after impact
          p.vx = (Math.random() - 0.5) * 1.5;
          p.vy = (Math.random() - 0.5) * 1.5;
          p.state = "grounded";
          break;
        }
      }
    }

    // ==========================================
    // STAGE 2: GROUNDED FOAM DART SCAVENGING
    // ==========================================
    else if (p.state === "grounded") {
      // Any player walking within 22px automatically scavenges it into matching reserveAmmo pool!
      for (const player of players.values()) {
        if (player.isTaggedOut) continue;

        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist <= GLOBAL_CONFIG.groundScavengeRadius) {
          const ammoDef = AMMO_TYPES[p.ammoType] || AMMO_TYPES.elite_dart;
          const currentReserve = player.reserveAmmo[p.ammoType] || 0;
          const maxCarry = ammoDef.maxCarry || 120;

          if (currentReserve < maxCarry) {
            player.reserveAmmo[p.ammoType] = currentReserve + 1;
            projectiles.splice(i, 1);

            state.events.push({
              type: "scavenge_dart",
              ammoType: p.ammoType,
              x: p.x,
              y: p.y,
              playerId: player.id,
            });
            break;
          }
        }
      }
    }
  }
}

/**
 * Destroys a cardboard box and scatters 2-5 loose scavengeable darts onto the floor.
 * @param {object} state
 * @param {object} box
 */
function destroyCardboardBox(state, box) {
  state.map.tiles[box.r][box.c] = "."; // Turns into passable floor
  state.map.boxes.delete(`${box.r}_${box.c}`);

  state.events.push({
    type: "box_destroyed",
    x: box.x,
    y: box.y,
  });

  // Scatter 3-5 grounded floor darts
  const scatterCount = 3 + Math.floor(Math.random() * 3);
  for (let k = 0; k < scatterCount; k++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 14;
    state.projectiles.push({
      id: `box_drop_${state.nextEntityId++}`,
      shooterId: null,
      ammoType: "elite_dart",
      damage: 0,
      x: box.x + Math.cos(angle) * dist,
      y: box.y + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      drag: 0.98,
      bouncesLeft: 0,
      radius: 3,
      length: 10,
      color: "#ff5500",
      tipColor: "#1e60ff",
      state: "grounded",
      lifeTicks: 100,
    });
  }
}

/**
 * Applies damage to a player, triggers knockback, and checks for "Tagged Out" (0 HP).
 * @param {object} state
 * @param {object} target
 * @param {number} damage
 * @param {string} shooterId
 */
function applyDamageToPlayer(state, target, damage, shooterId) {
  target.hp = Math.max(0, target.hp - damage);

  if (target.hp <= 0 && !target.isTaggedOut) {
    target.isTaggedOut = true;
    target.respawnTimerMs = GLOBAL_CONFIG.respawnDelayMs;

    const shooter = state.players.get(shooterId);
    if (shooter && shooter.id !== target.id) {
      shooter.tagsDealt++;
      shooter.score += 100;
    }

    state.events.push({
      type: "player_eliminated",
      targetId: target.id,
      targetName: target.name,
      shooterId,
      shooterName: shooter ? shooter.name : "Hazard",
    });
  }
}
// === SECTION: BALLISTICS_AND_SCAVENGING END ===

// === SECTION: GADGETS_AND_DETONATIONS START ===
/**
 * Updates ticking grenades, claymore proximity triggers, and the Nerf Nuke.
 * @param {object} state
 * @param {number} dtMs
 */
export function updateGadgetsAndDetonations(state, dtMs) {
  const { floorLoot, players, map } = state;

  for (let i = floorLoot.length - 1; i >= 0; i--) {
    const item = floorLoot[i];

    // 1. Thrown Grenade & Nerf Nuke Physics
    if (item.type === "grenade" || item.type === "nerf_nuke") {
      if (item.vx || item.vy) {
        item.x += item.vx;
        item.y += item.vy;
        item.vx *= 0.94;
        item.vy *= 0.94;

        if (Math.hypot(item.vx, item.vy) < 0.1) {
          item.vx = 0;
          item.vy = 0;
        }

        // Wall collision reflection
        const c = Math.floor(item.x / GLOBAL_CONFIG.tileSize);
        const r = Math.floor(item.y / GLOBAL_CONFIG.tileSize);
        if (map.tiles[r]?.[c] === "#") {
          item.vx = -item.vx * 0.6;
          item.vy = -item.vy * 0.6;
        }
      }

      // Detonation countdown
      item.timerMs -= dtMs;
      if (item.timerMs <= 0) {
        detonateExplosive(state, item);
        floorLoot.splice(i, 1);
        continue;
      }
    }

    // 2. Directional Claymore Mine
    else if (item.type === "claymore") {
      if (!item.armed) {
        item.armTimerMs -= dtMs;
        if (item.armTimerMs <= 0) {
          item.armed = true;
          state.events.push({
            type: "claymore_armed",
            x: item.x,
            y: item.y,
          });
        }
        continue;
      }

      if (item.detonating) {
        item.detonateTimerMs -= dtMs;
        if (item.detonateTimerMs <= 0) {
          detonateClaymore(state, item);
          floorLoot.splice(i, 1);
        }
        continue;
      }

      // Proximity scanning in directional cone
      for (const player of players.values()) {
        if (player.isTaggedOut) continue;
        // Tactical Front Flip vaults completely over ground claymores!
        if (player.isFlipping) continue;

        const dx = player.x - item.x;
        const dy = player.y - item.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= item.proximityRadius) {
          let angleToPlayer = Math.atan2(dy, dx) - item.facingAngle;
          angleToPlayer = Math.atan2(Math.sin(angleToPlayer), Math.cos(angleToPlayer));

          if (Math.abs(angleToPlayer) <= item.coneAngle / 2) {
            // Trigger detonation countdown beep
            item.detonating = true;
            state.events.push({
              type: "claymore_triggered",
              x: item.x,
              y: item.y,
            });
            break;
          }
        }
      }
    }
  }
}

/**
 * Detonates a grenade or the massive Nerf Nuke cluster device.
 * @param {object} state
 * @param {object} item
 */
function detonateExplosive(state, item) {
  const shrapnelCount = item.shrapnelCount || 12;
  const speed = item.shrapnelSpeed || 9;
  const bounces = item.shrapnelBounces || 1;
  const ammoType = item.shrapnelAmmoType || "elite_dart";

  state.events.push({
    type: item.type === "nerf_nuke" ? "nuke_detonated" : "grenade_detonated",
    x: item.x,
    y: item.y,
  });

  // Spawn radial shrapnel barrage
  const angleStep = (Math.PI * 2) / shrapnelCount;
  for (let k = 0; k < shrapnelCount; k++) {
    const angle = k * angleStep + (Math.random() - 0.5) * 0.15;
    const velocity = speed * (0.8 + Math.random() * 0.4);

    state.projectiles.push({
      id: `shrapnel_${state.nextEntityId++}`,
      shooterId: item.ownerId,
      ammoType,
      damage: item.type === "nerf_nuke" ? 18 : 12,
      x: item.x,
      y: item.y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      drag: 0.982,
      bouncesLeft: bounces,
      radius: 3,
      length: 10,
      color: "#ff5500",
      tipColor: "#1e60ff",
      state: "airborne",
      lifeTicks: 0,
    });
  }
}

/**
 * Detonates a directional claymore in its forward cone.
 * @param {object} state
 * @param {object} item
 */
function detonateClaymore(state, item) {
  const shrapnelCount = item.shrapnelCount || 10;
  const speed = item.shrapnelSpeed || 10;
  const cone = item.coneAngle || 0.9;
  const facing = item.facingAngle;

  state.events.push({
    type: "claymore_exploded",
    x: item.x,
    y: item.y,
  });

  for (let k = 0; k < shrapnelCount; k++) {
    const angleOffset = (k / (shrapnelCount - 1) - 0.5) * cone;
    const angle = facing + angleOffset + (Math.random() - 0.5) * 0.08;
    const velocity = speed * (0.85 + Math.random() * 0.3);

    state.projectiles.push({
      id: `clay_shrapnel_${state.nextEntityId++}`,
      shooterId: item.ownerId,
      ammoType: item.shrapnelAmmoType || "elite_dart",
      damage: 15,
      x: item.x,
      y: item.y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      drag: 0.982,
      bouncesLeft: item.shrapnelBounces || 1,
      radius: 3,
      length: 10,
      color: "#ff5500",
      tipColor: "#1e60ff",
      state: "airborne",
      lifeTicks: 0,
    });
  }
}
// === SECTION: GADGETS_AND_DETONATIONS END ===

// === SECTION: MOVEMENT_AND_FLIP START ===
/**
 * Updates player movement, collisions, front-flip lunges, and stamina regeneration.
 * @param {object} state
 * @param {object} player
 * @param {object} inputSnapshot { keys, aimAngle, flipPressed }
 * @param {number} dtMs
 */
export function updatePlayerMovement(state, player, inputSnapshot, dtMs) {
  const { map } = state;
  const dtSec = dtMs / 1000;

  // Handle Tagged-Out Respawn Countdown
  if (player.isTaggedOut) {
    player.respawnTimerMs -= dtMs;
    if (player.respawnTimerMs <= 0) {
      player.isTaggedOut = false;
      player.hp = GLOBAL_CONFIG.playerBaseHp;
      player.stamina = GLOBAL_CONFIG.maxStamina;
      const spawns = map.spawns;
      const spawnPos = spawns.length > 0 ? spawns[Math.floor(Math.random() * spawns.length)] : { x: 80, y: 80 };
      player.x = spawnPos.x;
      player.y = spawnPos.y;
      player.vx = 0;
      player.vy = 0;
      state.events.push({
        type: "player_respawn",
        x: player.x,
        y: player.y,
        playerId: player.id,
      });
    }
    return;
  }

  // Sync Aim Angle
  if (typeof inputSnapshot.aimAngle === "number") {
    player.aimAngle = inputSnapshot.aimAngle;
  }

  const keys = inputSnapshot.keys || {};
  player.isCrouching = !!(keys.KeyC || keys.ControlLeft || keys.ControlRight);
  const wantsSprint = !!(keys.ShiftLeft || keys.ShiftRight);

  // Check Stamina Sprint Drain
  const isMoving = keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD;
  if (wantsSprint && isMoving && player.stamina > 0 && !player.isFlipping) {
    player.isSprinting = true;
    player.stamina = Math.max(0, player.stamina - GLOBAL_CONFIG.sprintCost * dtSec);
  } else {
    player.isSprinting = false;
    // Stamina Regeneration (pauses during sprint / flip)
    if (!player.isFlipping && player.stamina < GLOBAL_CONFIG.maxStamina) {
      player.stamina = Math.min(
        GLOBAL_CONFIG.maxStamina,
        player.stamina + GLOBAL_CONFIG.staminaRegenRate * dtSec
      );
    }
  }

  // Tactical Front Flip Trigger (Spacebar, costs 50 stamina)
  if (inputSnapshot.flipPressed && !player.isFlipping && player.stamina >= GLOBAL_CONFIG.flipCost) {
    player.stamina -= GLOBAL_CONFIG.flipCost;
    player.isFlipping = true;
    player.flipTimerMs = GLOBAL_CONFIG.flipDurationMs;

    // Flip in movement direction if moving, else aim direction
    let moveX = 0;
    let moveY = 0;
    if (keys.KeyW) moveY -= 1;
    if (keys.KeyS) moveY += 1;
    if (keys.KeyA) moveX -= 1;
    if (keys.KeyD) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
      player.flipAngle = Math.atan2(moveY, moveX);
    } else {
      player.flipAngle = player.aimAngle;
    }

    state.events.push({
      type: "front_flip",
      x: player.x,
      y: player.y,
      playerId: player.id,
    });
  }

  const { effectiveSpeed } = getPlayerMobility(player);

  // Front-Flip Lunge Movement
  if (player.isFlipping) {
    player.flipTimerMs -= dtMs;
    const flipSpeed = effectiveSpeed * GLOBAL_CONFIG.flipSpeedMultiplier;
    player.vx = Math.cos(player.flipAngle) * flipSpeed;
    player.vy = Math.sin(player.flipAngle) * flipSpeed;

    if (player.flipTimerMs <= 0) {
      player.isFlipping = false;
    }
  } else {
    // Normal WASD Directional Input
    let moveX = 0;
    let moveY = 0;
    if (keys.KeyW) moveY -= 1;
    if (keys.KeyS) moveY += 1;
    if (keys.KeyA) moveX -= 1;
    if (keys.KeyD) moveX += 1;

    if (moveX !== 0 && moveY !== 0) {
      const diag = 1 / Math.SQRT2;
      moveX *= diag;
      moveY *= diag;
    }

    player.vx = moveX * effectiveSpeed;
    player.vy = moveY * effectiveSpeed;
  }

  // Move & Resolve Wall / Obstacle Collisions
  resolvePlayerMovementWithMap(player, map);
}

/**
 * Resolves player motion against map geometry (Walls, Couches, Destructible Boxes).
 * Front-flipping players vault over '=' half-cover without colliding!
 * @param {object} player
 * @param {object} map
 */
function resolvePlayerMovementWithMap(player, map) {
  const radius = GLOBAL_CONFIG.playerRadius;
  const tileSize = GLOBAL_CONFIG.tileSize;

  // Move X
  player.x += player.vx;
  let minCol = Math.floor((player.x - radius) / tileSize);
  let maxCol = Math.floor((player.x + radius) / tileSize);
  let minRow = Math.floor((player.y - radius) / tileSize);
  let maxRow = Math.floor((player.y + radius) / tileSize);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (r < 0 || r >= map.height || c < 0 || c >= map.width) {
        // Arena boundary
        clampPlayerToTile(player, r, c, "x", radius, tileSize);
        continue;
      }

      const tile = map.tiles[r][c];

      // Solid Wall (#)
      if (tile === "#") {
        clampPlayerToTile(player, r, c, "x", radius, tileSize);
      }
      // Couch / Half-Cover (=) - Blocks walking, but front-flip vaults cleanly over!
      else if (tile === "=" && !player.isFlipping) {
        clampPlayerToTile(player, r, c, "x", radius, tileSize);
      }
      // Destructible Box (O)
      else if (tile === "O") {
        const box = map.boxes.get(`${r}_${c}`);
        if (box && box.hp > 0 && !player.isFlipping) {
          clampPlayerToTile(player, r, c, "x", radius, tileSize);
        }
      }
    }
  }

  // Move Y
  player.y += player.vy;
  minCol = Math.floor((player.x - radius) / tileSize);
  maxCol = Math.floor((player.x + radius) / tileSize);
  minRow = Math.floor((player.y - radius) / tileSize);
  maxRow = Math.floor((player.y + radius) / tileSize);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (r < 0 || r >= map.height || c < 0 || c >= map.width) {
        clampPlayerToTile(player, r, c, "y", radius, tileSize);
        continue;
      }

      const tile = map.tiles[r][c];

      if (tile === "#") {
        clampPlayerToTile(player, r, c, "y", radius, tileSize);
      } else if (tile === "=" && !player.isFlipping) {
        clampPlayerToTile(player, r, c, "y", radius, tileSize);
      } else if (tile === "O") {
        const box = map.boxes.get(`${r}_${c}`);
        if (box && box.hp > 0 && !player.isFlipping) {
          clampPlayerToTile(player, r, c, "y", radius, tileSize);
        }
      }
    }
  }
}

/**
 * Clamps player coordinate away from a solid tile.
 */
function clampPlayerToTile(player, r, c, axis, radius, tileSize) {
  const tileMinX = c * tileSize;
  const tileMaxX = (c + 1) * tileSize;
  const tileMinY = r * tileSize;
  const tileMaxY = (r + 1) * tileSize;

  if (axis === "x") {
    if (player.vx > 0) {
      player.x = tileMinX - radius - 0.01;
    } else if (player.vx < 0) {
      player.x = tileMaxX + radius + 0.01;
    }
  } else if (axis === "y") {
    if (player.vy > 0) {
      player.y = tileMinY - radius - 0.01;
    } else if (player.vy < 0) {
      player.y = tileMaxY + radius + 0.01;
    }
  }
}
// === SECTION: MOVEMENT_AND_FLIP END ===

// === SECTION: INTERACTION_AND_PADS START ===
/**
 * Handles floor item interactions (swapping weapons, defusing Nerf Nuke) and map pad reload timers.
 * @param {object} state
 * @param {object} player
 * @param {boolean} interactPressed
 * @param {number} dtMs
 */
export function handleInteractions(state, player, interactPressed, dtMs) {
  if (player.isTaggedOut) return;

  const interactDist = GLOBAL_CONFIG.interactRadius;

  // 1. Defusing / Picking up ticking Nerf Nuke
  if (interactPressed) {
    for (let i = state.floorLoot.length - 1; i >= 0; i--) {
      const item = state.floorLoot[i];
      if (item.type === "nerf_nuke" && item.canBeDefused) {
        const dist = Math.hypot(item.x - player.x, item.y - player.y);
        if (dist <= interactDist + 15) {
          // Defused! Give nuke back into player inventory if weight allows
          state.floorLoot.splice(i, 1);
          if (!player.weapons.includes("nerf_nuke")) {
            player.weapons.push("nerf_nuke");
          }
          state.events.push({
            type: "nuke_defused",
            x: player.x,
            y: player.y,
            playerId: player.id,
          });
          return;
        }
      }
    }

    // 2. Swapping Floor Weapons
    for (let i = state.floorLoot.length - 1; i >= 0; i--) {
      const item = state.floorLoot[i];
      if (item.type === "weapon") {
        const dist = Math.hypot(item.x - player.x, item.y - player.y);
        if (dist <= interactDist) {
          const currentWeaponKey = player.weapons[player.activeSlot];
          const currentMag = player.magAmmo[currentWeaponKey] || 0;

          // Swap active weapon with floor weapon
          player.weapons[player.activeSlot] = item.weaponKey;
          player.magAmmo[item.weaponKey] = item.magAmmo || (WEAPONS[item.weaponKey]?.magSize || 1);

          // Drop old weapon in its place
          if (currentWeaponKey) {
            item.weaponKey = currentWeaponKey;
            item.magAmmo = currentMag;
          } else {
            state.floorLoot.splice(i, 1);
          }

          state.events.push({
            type: "weapon_swap",
            x: player.x,
            y: player.y,
            playerId: player.id,
            newWeapon: player.weapons[player.activeSlot],
          });
          return;
        }
      }
    }
  }

  // 3. Auto-Scavenge Floor Ammo Piles
  for (let i = state.floorLoot.length - 1; i >= 0; i--) {
    const item = state.floorLoot[i];
    if (item.type === "ammo") {
      const dist = Math.hypot(item.x - player.x, item.y - player.y);
      if (dist <= GLOBAL_CONFIG.groundScavengeRadius) {
        const ammoDef = AMMO_TYPES[item.ammoType] || AMMO_TYPES.elite_dart;
        const currentReserve = player.reserveAmmo[item.ammoType] || 0;
        const maxCarry = ammoDef.maxCarry || 120;

        if (currentReserve < maxCarry) {
          const toAdd = Math.min(item.count, maxCarry - currentReserve);
          player.reserveAmmo[item.ammoType] = currentReserve + toAdd;
          item.count -= toAdd;

          state.events.push({
            type: "scavenge_ammo_pack",
            ammoType: item.ammoType,
            count: toAdd,
            x: item.x,
            y: item.y,
            playerId: player.id,
          });

          if (item.count <= 0) {
            state.floorLoot.splice(i, 1);
          }
        }
      }
    }
  }
}

/**
 * Updates Weapon Pad and Ammo Pad 180s respawn timers.
 * @param {object} state
 * @param {number} dtMs
 */
export function updateMapPads(state, dtMs) {
  const { map } = state;

  // 1. Weapon Pads (Reload every 180 seconds)
  for (const pad of map.weaponPads) {
    const isOccupied = state.floorLoot.some(
      (loot) => loot.padType === "weapon" && loot.padIndex === map.weaponPads.indexOf(pad)
    );

    if (!isOccupied) {
      pad.respawnTimer += dtMs;
      if (pad.respawnTimer >= LOOT_CONFIG.weaponRespawnInterval * 1000) {
        pad.respawnTimer = 0;
        const weaponKey = pickWeightedItem(WEAPONS);
        if (weaponKey) {
          const weaponDef = WEAPONS[weaponKey];
          state.floorLoot.push({
            id: `pad_w_${state.nextEntityId++}`,
            x: pad.x,
            y: pad.y,
            type: "weapon",
            weaponKey,
            magAmmo: weaponDef.magSize || 1,
            padType: "weapon",
            padIndex: map.weaponPads.indexOf(pad),
          });
        }
      }
    }
  }

  // 2. Ammo Pads (Reload every 180 seconds)
  for (const pad of map.ammoPads) {
    const isOccupied = state.floorLoot.some(
      (loot) => loot.padType === "ammo" && loot.padIndex === map.ammoPads.indexOf(pad)
    );

    if (!isOccupied) {
      pad.respawnTimer += dtMs;
      if (pad.respawnTimer >= LOOT_CONFIG.ammoRespawnInterval * 1000) {
        pad.respawnTimer = 0;
        const ammoKey = pickWeightedItem(AMMO_TYPES);
        if (ammoKey) {
          const min = LOOT_CONFIG.ammoSpawnCountMin;
          const max = LOOT_CONFIG.ammoSpawnCountMax;
          const count = Math.floor(min + Math.random() * (max - min + 1));
          state.floorLoot.push({
            id: `pad_d_${state.nextEntityId++}`,
            x: pad.x,
            y: pad.y,
            type: "ammo",
            ammoType: ammoKey,
            count,
            padType: "ammo",
            padIndex: map.ammoPads.indexOf(pad),
          });
        }
      }
    }
  }
}
// === SECTION: INTERACTION_AND_PADS END ===

// === SECTION: MASTER_PHYSICS_LOOP START ===
/**
 * Master Authoritative Physics Update Tick.
 * Runs on Host at 60 FPS.
 * @param {object} state
 * @param {number} dtMs
 * @param {Map<string, object>} clientInputs
 */
export function updatePhysics(state, dtMs, clientInputs) {
  state.tick++;
  state.events = []; // Clear transient events from previous tick

  // 1. Process Player Inputs, Movement, Blasters, and Interactions
  for (const [playerId, player] of state.players.entries()) {
    const input = clientInputs.get(playerId) || { keys: {} };

    // Handle weapon slot switching (1, 2, 3)
    if (typeof input.weaponSlot === "number" && input.weaponSlot < player.weapons.length) {
      if (player.activeSlot !== input.weaponSlot && !player.isReloading) {
        player.activeSlot = input.weaponSlot;
        player.fireCooldownMs = 200; // brief switch delay
      }
    }

    // Update Movement & Front-Flip Lunge
    updatePlayerMovement(state, player, input, dtMs);

    // Update Blaster, Melee, Flywheel, and Gadget actions
    handlePlayerBlaster(
      state,
      player,
      !!input.firing,
      !!input.revving,
      !!input.reloading,
      dtMs
    );

    // Floor Loot, Swapping, and Defuse interactions
    handleInteractions(state, player, !!input.interactPressed, dtMs);
  }

  // 2. Update Two-Stage Foam Ballistics & Dart Scavenging
  updateBallisticsAndScavenging(state, dtMs);

  // 3. Update Gadgets, Claymores & Detonations
  updateGadgetsAndDetonations(state, dtMs);

  // 4. Update Weapon & Ammo Pads Respawn Timers
  updateMapPads(state, dtMs);

  return state;
}
// === SECTION: MASTER_PHYSICS_LOOP END ===
