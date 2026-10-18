/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// =============================================================================
// FOAM STRIKE: TACTICAL FOAM-DART SHOOTER - CANVAS RENDERER
// Pure Canvas 2D Rendering of Arena, Darts, Ground Scavenging, Operatives, & HUD
// STRICT ARCHITECTURAL RULE: SECTION FENCES FOR ISOLATED EDITABILITY
// =============================================================================

import { GLOBAL_CONFIG, AMMO_TYPES, WEAPONS } from "./config.js";
import { getPlayerMobility } from "./physics.js";

// === SECTION: CAMERA_AND_FX START ===
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.shake = 0;
  }

  update(targetX, targetY) {
    this.targetX = targetX;
    this.targetY = targetY;
    const lerp = GLOBAL_CONFIG.cameraLerp || 0.12;
    this.x += (this.targetX - this.x) * lerp;
    this.y += (this.targetY - this.y) * lerp;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - 0.8);
    }
  }

  addShake(amount) {
    this.shake = Math.min(25, this.shake + amount);
  }

  getOffset(viewportWidth, viewportHeight) {
    const shakeX = (Math.random() - 0.5) * this.shake * 2;
    const shakeY = (Math.random() - 0.5) * this.shake * 2;
    return {
      x: viewportWidth / 2 - this.x + shakeX,
      y: viewportHeight / 2 - this.y + shakeY,
    };
  }
}

export class ParticlePool {
  constructor() {
    this.particles = [];
  }

  spawnMuzzleFlash(x, y, angle) {
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.4;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        color: Math.random() > 0.5 ? "#ffaa00" : "#ff5500",
        size: 3 + Math.random() * 2,
        life: 1.0,
        decay: 0.12,
      });
    }
  }

  spawnHitSparks(x, y, color = "#ff7700") {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 2.5,
        life: 1.0,
        decay: 0.08,
      });
    }
  }

  spawnPopText(x, y, text, color = "#ffdd55") {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1.2,
      text,
      color,
      isText: true,
      life: 1.0,
      decay: 0.03,
    });
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.isText) {
        ctx.font = "bold 13px 'Chakra Petch', sans-serif";
        ctx.fillStyle = p.color;
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
// === SECTION: CAMERA_AND_FX END ===

// === SECTION: MAP_RENDERER START ===
/**
 * Renders the floor, tactical walls, couches, destructible boxes, and spawn pads.
 * Supports both 'tactical' and high-clarity 'basic' testing playground visual modes.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} map
 */
export function renderMap(ctx, map) {
  const tileSize = GLOBAL_CONFIG.tileSize;
  const { width, height, tiles, boxes, weaponPads, ammoPads } = map;
  const isBasic = GLOBAL_CONFIG.visualMode === "basic";

  // 1. Gridded Arena Floor
  ctx.fillStyle = isBasic ? "#1a1f29" : "#15181e";
  ctx.fillRect(0, 0, width * tileSize, height * tileSize);

  ctx.strokeStyle = isBasic ? "rgba(96, 165, 250, 0.12)" : "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= width; c++) {
    ctx.moveTo(c * tileSize, 0);
    ctx.lineTo(c * tileSize, height * tileSize);
  }
  for (let r = 0; r <= height; r++) {
    ctx.moveTo(0, r * tileSize);
    ctx.lineTo(width * tileSize, r * tileSize);
  }
  ctx.stroke();

  // Basic Visuals: Render clean distance markers along shooting lanes
  if (isBasic) {
    ctx.save();
    ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
    ctx.font = "bold 10px 'Chakra Petch', monospace";
    ctx.textAlign = "center";
    for (let c = 2; c < width - 2; c += 2) {
      const distMeters = (c - 2) * 2;
      ctx.fillText(`${distMeters}m`, c * tileSize + tileSize / 2, 70);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(c * tileSize + tileSize / 2, 80);
      ctx.lineTo(c * tileSize + tileSize / 2, height * tileSize - 40);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Playground Watermark
    ctx.fillStyle = "rgba(96, 165, 250, 0.3)";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("TESTING PLAYGROUND // BALLISTICS & PHYSICS RANGE", 20, 24);
    ctx.restore();
  }

  // 2. Weapon & Ammo Spawn Pads
  const now = performance.now();
  for (const pad of weaponPads) {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    const pulse = Math.sin(now * 0.004) * 3;

    if (isBasic) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10px 'Chakra Petch', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GUN PAD", 0, 0);
    } else {
      // Glowing neon cyan pad
      ctx.fillStyle = "rgba(0, 200, 255, 0.12)";
      ctx.beginPath();
      ctx.arc(0, 0, 18 + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#00d2ff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#00d2ff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("WEAPON", 0, 0);
    }
    ctx.restore();
  }

  for (const pad of ammoPads) {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    const pulse = Math.cos(now * 0.004) * 3;

    if (isBasic) {
      ctx.fillStyle = "rgba(251, 146, 60, 0.18)";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fb923c";
      ctx.font = "bold 10px 'Chakra Petch', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AMMO PAD", 0, 0);
    } else {
      // Glowing neon orange ammo pad
      ctx.fillStyle = "rgba(255, 140, 0, 0.12)";
      ctx.beginPath();
      ctx.arc(0, 0, 18 + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ff9f1a";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#ff9f1a";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AMMO", 0, 0);
    }
    ctx.restore();
  }

  // 3. Tile Geometry
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const tile = tiles[r][c];
      const x = c * tileSize;
      const y = r * tileSize;

      // Solid Wall (#)
      if (tile === "#") {
        if (isBasic) {
          ctx.fillStyle = "#262e3d";
          ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
          ctx.strokeStyle = "#475569";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
        } else {
          // Wall drop shadow
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fillRect(x + 4, y + 4, tileSize, tileSize);

          // Wall base
          ctx.fillStyle = "#1e2430";
          ctx.fillRect(x, y, tileSize, tileSize);

          // Top beveled highlight
          ctx.fillStyle = "#2c3445";
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

          ctx.strokeStyle = "#3e4a60";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
        }
      }

      // Couch / Half-Cover (=)
      else if (tile === "=") {
        if (isBasic) {
          ctx.fillStyle = "#134e4a";
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
          ctx.strokeStyle = "#2dd4bf";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

          ctx.fillStyle = "#5eead4";
          ctx.font = "bold 9px 'Chakra Petch', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("VAULT", x + tileSize / 2, y + tileSize / 2);
        } else {
          // Half-cover shadow
          ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
          ctx.fillRect(x + 2, y + 2, tileSize, tileSize);

          // Couch cushion color (tactical leather / fabric)
          ctx.fillStyle = "#3a4a3e";
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

          // Center cushion seam
          ctx.strokeStyle = "#5a7060";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + tileSize / 2);
          ctx.lineTo(x + tileSize - 4, y + tileSize / 2);
          ctx.stroke();

          // Vault indicator stripes
          ctx.strokeStyle = "rgba(100, 255, 150, 0.35)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
        }
      }

      // Destructible Cardboard Box (O)
      else if (tile === "O") {
        const box = boxes.get(`${r}_${c}`);
        const hp = box ? box.hp : GLOBAL_CONFIG.boxMaxHp;

        if (isBasic) {
          ctx.fillStyle = "#78350f";
          ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

          ctx.fillStyle = "#fef3c7";
          ctx.font = "bold 9px 'Chakra Petch', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`HP:${Math.max(0, hp)}`, x + tileSize / 2, y + tileSize / 2);
        } else {
          // Cardboard brown base
          ctx.fillStyle = "#8d5b2c";
          ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

          // Tape stripe
          ctx.fillStyle = "#b88a44";
          ctx.fillRect(x + tileSize / 2 - 4, y + 3, 8, tileSize - 6);

          // Cardboard border
          ctx.strokeStyle = "#633c16";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

          // Damage cracks if damaged
          if (hp < GLOBAL_CONFIG.boxMaxHp) {
            ctx.strokeStyle = "#381f08";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 8, y + 8);
            ctx.lineTo(x + 20, y + 22);
            ctx.lineTo(x + 30, y + 15);
            ctx.stroke();
          }
        }
      }
    }
  }
}
// === SECTION: MAP_RENDERER END ===

// === SECTION: PROJECTILES_AND_LOOT START ===
/**
 * Renders airborne projectiles, grounded scavengeable darts, and floor loot.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} projectiles
 * @param {object[]} floorLoot
 * @param {object} localPlayer
 */
export function renderProjectilesAndLoot(ctx, projectiles, floorLoot, localPlayer) {
  const now = performance.now();

  // 1. Floor Loot Pickups (Weapons, Ammo Bundles, Claymores, Nerf Nuke)
  for (const item of floorLoot) {
    ctx.save();
    ctx.translate(item.x, item.y);

    if (item.type === "weapon") {
      const wDef = WEAPONS[item.weaponKey] || {};
      const rarityColor = wDef.color || "#00d2ff";

      // Pulsing rarity ring
      const pulse = Math.sin(now * 0.005) * 2;
      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = rarityColor;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, 16 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Weapon label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Chakra Petch', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(wDef.name || item.weaponKey, 0, -20);

      // Check distance for interact tooltip "[E] Swap"
      if (localPlayer && !localPlayer.isTaggedOut) {
        const dist = Math.hypot(item.x - localPlayer.x, item.y - localPlayer.y);
        if (dist <= GLOBAL_CONFIG.interactRadius) {
          ctx.fillStyle = "#ffee55";
          ctx.font = "bold 11px sans-serif";
          ctx.fillText("[E] SWAP", 0, 26);
        }
      }
    } else if (item.type === "ammo") {
      const ammoDef = AMMO_TYPES[item.ammoType] || {};
      const color = ammoDef.color || "#ff5500";

      // Ammo box / crate
      ctx.fillStyle = color;
      ctx.fillRect(-8, -6, 16, 12);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -6, 16, 12);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`+${item.count}`, 0, -10);
    } else if (item.type === "claymore") {
      // Directional Claymore
      ctx.rotate(item.facingAngle);

      // Laser Trip Cone
      ctx.fillStyle = item.detonating
        ? "rgba(255, 0, 0, 0.4)"
        : item.armed
        ? "rgba(255, 80, 0, 0.15)"
        : "rgba(100, 100, 100, 0.1)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const halfCone = (item.coneAngle || 0.9) / 2;
      ctx.arc(0, 0, item.proximityRadius || 55, -halfCone, halfCone);
      ctx.closePath();
      ctx.fill();

      // Claymore Body
      ctx.fillStyle = "#2c3e2e";
      ctx.fillRect(-6, -10, 12, 20);
      ctx.strokeStyle = item.armed ? "#ff3333" : "#ffbb33";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-6, -10, 12, 20);

      // Blinking Sensor LED
      const blink = Math.sin(now * 0.015) > 0;
      ctx.fillStyle = blink ? "#ff0000" : "#440000";
      ctx.beginPath();
      ctx.arc(4, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.type === "nerf_nuke") {
      // Nerf Nuke Cluster Device
      const remainingSec = Math.max(0, item.timerMs / 1000).toFixed(1);
      const pulse = Math.sin(now * 0.02) * 3;

      // Hazard Defuse Ring
      ctx.strokeStyle = "#ff0055";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Nuke Warhead
      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Flashing countdown text
      ctx.fillStyle = "#ff0044";
      ctx.font = "bold 13px 'Chakra Petch', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${remainingSec}s`, 0, -22);

      // Defuse prompt if local player is near
      if (localPlayer && !localPlayer.isTaggedOut) {
        const dist = Math.hypot(item.x - localPlayer.x, item.y - localPlayer.y);
        if (dist <= GLOBAL_CONFIG.interactRadius + 15) {
          ctx.fillStyle = "#00ff88";
          ctx.font = "bold 12px sans-serif";
          ctx.fillText("[E] DEFUSE NUKE", 0, 28);
        }
      }
    } else if (item.type === "grenade") {
      // Grenade Canister
      ctx.fillStyle = "#4a6b4a";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffaa00";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Sparking fuse
      ctx.fillStyle = "#ff5500";
      ctx.beginPath();
      ctx.arc(6, -6, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 2. Projectiles (Two-Stage: Airborne vs Grounded)
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);

    // ==========================================
    // STAGE 2: GROUNDED FOAM DARTS (SCAVENGABLE)
    // ==========================================
    if (p.state === "grounded") {
      // Subtle scavengeable proximity halo if player is near
      if (localPlayer) {
        const dist = Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y);
        if (dist <= GLOBAL_CONFIG.groundScavengeRadius + 15) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (p.ammoType === "rival_ball") {
        // Yellow Rival foam ball resting on floor
        ctx.fillStyle = p.color || "#ffee00";
        ctx.beginPath();
        ctx.arc(0, 0, p.radius || 5, 0, Math.PI * 2);
        ctx.fill();
        // Subtle dimple shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.arc(1, 1, (p.radius || 5) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Elite Dart resting flat on floor
        const angle = p.restingAngle || 0.4;
        ctx.rotate(angle);

        // Orange foam cylinder body
        ctx.fillStyle = p.color || "#ff5500";
        ctx.fillRect(-5, -2, 8, 4);

        // Blue rubber suction tip
        ctx.fillStyle = p.tipColor || "#1e60ff";
        ctx.fillRect(3, -2.5, 3.5, 5);
      }
    }

    // ==========================================
    // STAGE 1: AIRBORNE HIGH-SPEED DARTS & BALLS
    // ==========================================
    else if (p.state === "airborne") {
      const heading = Math.atan2(p.vy, p.vx);
      ctx.rotate(heading);

      if (p.ammoType === "rival_ball") {
        // High-velocity Rival sphere
        ctx.fillStyle = p.color || "#ffee00";
        ctx.beginPath();
        ctx.arc(0, 0, p.radius || 5, 0, Math.PI * 2);
        ctx.fill();

        // Motion blur glow
        ctx.strokeStyle = "rgba(255, 238, 0, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
      } else {
        // High-velocity Elite Dart
        // Dart body (orange)
        ctx.fillStyle = p.color || "#ff5500";
        ctx.fillRect(-6, -2, 9, 4);

        // Blue rubber tip
        ctx.fillStyle = p.tipColor || "#1e60ff";
        ctx.fillRect(3, -2.5, 4, 5);

        // Motion trail
        ctx.strokeStyle = "rgba(255, 85, 0, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(-6, 0);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
// === SECTION: PROJECTILES_AND_LOOT END ===

// === SECTION: PLAYER_RENDERER START ===
/**
 * Renders tactical operatives, aiming blasters, flywheel vibration, and front-flip somersaults.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Map<string, object>} players
 * @param {string} localPlayerId
 */
export function renderPlayers(ctx, players, localPlayerId) {
  const now = performance.now();

  for (const [id, player] of players.entries()) {
    if (player.isTaggedOut) {
      // Render Tagged-Out Respawn Marker
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = "rgba(255, 50, 50, 0.2)";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ff4757";
      ctx.font = "bold 11px 'Chakra Petch', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TAGGED OUT", 0, -25);
      const remaining = Math.max(0, player.respawnTimerMs / 1000).toFixed(1);
      ctx.fillText(`RESPAWNING: ${remaining}s`, 0, -10);
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.translate(player.x, player.y);

    const isLocal = id === localPlayerId;
    const currentWeaponKey = player.weapons[player.activeSlot];
    const weaponDef = WEAPONS[currentWeaponKey] || {};

    // 1. Shadow (Scales up during front-flip airborne state!)
    const flipProgress = player.isFlipping
      ? 1 - player.flipTimerMs / GLOBAL_CONFIG.flipDurationMs
      : 0;
    const elevation = player.isFlipping ? Math.sin(flipProgress * Math.PI) * 14 : 0;

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(
      0,
      elevation * 0.4,
      GLOBAL_CONFIG.playerRadius * (1 - elevation * 0.02),
      GLOBAL_CONFIG.playerRadius * 0.7 * (1 - elevation * 0.02),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // 2. Rotate towards aim or front-flip somersault
    if (player.isFlipping) {
      // Somersault spin along flip direction
      ctx.rotate(player.flipAngle);
      ctx.scale(1 + elevation * 0.03, 1 + elevation * 0.03);
    } else {
      ctx.rotate(player.aimAngle);
    }

    // 3. Flywheel Rev-Up Vibration Effect
    if (player.revProgressMs > 0 && weaponDef.revUpTime) {
      const shakeAmt = (player.revProgressMs / weaponDef.revUpTime) * 2;
      ctx.translate(
        (Math.random() - 0.5) * shakeAmt,
        (Math.random() - 0.5) * shakeAmt
      );
    }

    // 4. Blaster / Sword Model
    if (weaponDef.isMelee) {
      // Boffer sword held in right hand
      ctx.fillStyle = "#22cc88";
      ctx.fillRect(12, 4, 26, 5);
      ctx.fillStyle = "#111111";
      ctx.fillRect(6, 4, 6, 5); // Handle
    } else {
      // Tactical Foam Blaster
      const blasterColor = weaponDef.color || "#ff7700";
      ctx.fillStyle = blasterColor;
      ctx.fillRect(10, 3, 14, 5); // Blaster receiver
      ctx.fillStyle = "#222222";
      ctx.fillRect(8, 2, 6, 7); // Grip & stock
      // Bright orange safety muzzle tip
      ctx.fillStyle = "#ff5500";
      ctx.fillRect(24, 4, 4, 3);
    }

    // 5. Tactical Operative Silhouette / Body
    // Shoulders
    ctx.fillStyle = player.color || "#2ed573";
    ctx.beginPath();
    ctx.arc(0, 0, GLOBAL_CONFIG.playerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Tactical vest / armor
    ctx.fillStyle = "#1e272e";
    ctx.beginPath();
    ctx.arc(0, 0, GLOBAL_CONFIG.playerRadius - 3, 0, Math.PI * 2);
    ctx.fill();

    // Operative Visor / Cap (points forward)
    ctx.fillStyle = isLocal ? "#00d2ff" : "#ffa502";
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Front-flip somersault ring indicator
    if (player.isFlipping) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, GLOBAL_CONFIG.playerRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // 6. Overhead Health Bar & Name Tag (World Space)
    ctx.save();
    ctx.translate(player.x, player.y - 28 - elevation);

    // Name Tag
    ctx.fillStyle = isLocal ? "#00d2ff" : "#ffffff";
    ctx.font = "bold 11px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(player.name, 0, -4);

    // Health Bar
    const hpWidth = 32;
    const hpHeight = 4;
    const hpRatio = Math.max(0, player.hp / player.maxHp);

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(-hpWidth / 2, 0, hpWidth, hpHeight);

    ctx.fillStyle = hpRatio > 0.4 ? "#2ed573" : "#ff4757";
    ctx.fillRect(-hpWidth / 2, 0, hpWidth * hpRatio, hpHeight);
    ctx.restore();
  }
}
// === SECTION: PLAYER_RENDERER END ===

// === SECTION: HUD_AND_RETICLE START ===
/**
 * Renders aiming FOV cone, dynamic crosshair, and low-occlusion perimeter tactical HUD.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {object} player
 * @param {object} camera
 * @param {{x: number, y: number}} mousePos
 */
export function renderHUD(ctx, width, height, player, camera, mousePos) {
  if (!player) return;

  const currentWeaponKey = player.weapons[player.activeSlot];
  const weaponDef = WEAPONS[currentWeaponKey] || {};
  const { totalWeight, effectiveSpeed } = getPlayerMobility(player);

  // 1. Reticle & Tactical Aim Line (in World Coordinates)
  const camOffset = camera.getOffset(width, height);
  const playerScreenX = player.x + camOffset.x;
  const playerScreenY = player.y + camOffset.y;

  ctx.save();
  // Aim line
  ctx.strokeStyle = "rgba(0, 210, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(playerScreenX, playerScreenY);
  ctx.lineTo(mousePos.x, mousePos.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Dynamic Crosshair at Mouse
  const spread = weaponDef.spread || 0.05;
  const spreadPx = 6 + spread * 120;

  ctx.strokeStyle = "#00d2ff";
  ctx.lineWidth = 1.5;
  // Crosshair brackets
  ctx.beginPath();
  ctx.moveTo(mousePos.x - spreadPx, mousePos.y);
  ctx.lineTo(mousePos.x - spreadPx + 5, mousePos.y);
  ctx.moveTo(mousePos.x + spreadPx, mousePos.y);
  ctx.lineTo(mousePos.x + spreadPx - 5, mousePos.y);
  ctx.moveTo(mousePos.x, mousePos.y - spreadPx);
  ctx.lineTo(mousePos.x, mousePos.y - spreadPx + 5);
  ctx.moveTo(mousePos.x, mousePos.y + spreadPx);
  ctx.lineTo(mousePos.x, mousePos.y + spreadPx - 5);
  ctx.stroke();

  // Flywheel Spin Indicator at Crosshair
  if (player.revProgressMs > 0 && weaponDef.revUpTime) {
    const revRatio = player.revProgressMs / weaponDef.revUpTime;
    ctx.strokeStyle = revRatio >= 1.0 ? "#00ff88" : "#ffaa00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mousePos.x, mousePos.y, spreadPx + 4, 0, Math.PI * 2 * revRatio);
    ctx.stroke();
  }
  ctx.restore();

  // ==========================================
  // PERIMETER LOW-OCCLUSION TACTICAL HUD
  // ==========================================
  ctx.save();

  // --- BOTTOM LEFT: HEALTH, STAMINA, WEIGHT ---
  const blX = 24;
  const blY = height - 90;

  // Background panel
  ctx.fillStyle = "rgba(10, 14, 20, 0.75)";
  ctx.fillRect(blX - 10, blY - 14, 260, 88);
  ctx.strokeStyle = "rgba(0, 210, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(blX - 10, blY - 14, 260, 88);

  // Health Bar
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Chakra Petch', sans-serif";
  ctx.fillText(`HP: ${Math.round(player.hp)} / ${player.maxHp}`, blX, blY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(blX, blY + 4, 240, 8);
  ctx.fillStyle = player.hp > 35 ? "#2ed573" : "#ff4757";
  ctx.fillRect(blX, blY + 4, 240 * (player.hp / player.maxHp), 8);

  // Stamina Bar with 50% Front-Flip Marker
  const stY = blY + 28;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Chakra Petch', sans-serif";
  ctx.fillText(`STAMINA: ${Math.round(player.stamina)}%`, blX, stY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(blX, stY + 4, 240, 8);
  ctx.fillStyle = player.stamina >= 50 ? "#00d2ff" : "#ffa502";
  ctx.fillRect(blX, stY + 4, 240 * (player.stamina / player.maxStamina), 8);

  // 50% Threshold marker for Front Flip
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(blX + 120, stY + 2);
  ctx.lineTo(blX + 120, stY + 14);
  ctx.stroke();

  // Loadout Weight & Mobility Badge
  const speedPct = Math.round((effectiveSpeed / GLOBAL_CONFIG.playerBaseSpeed) * 100);
  ctx.fillStyle = totalWeight > 9.0 ? "#ffaa00" : "#a4b0be";
  ctx.font = "11px 'Chakra Petch', sans-serif";
  ctx.fillText(
    `WEIGHT: ${totalWeight.toFixed(1)} / ${GLOBAL_CONFIG.maxLoadoutWeight} kg  |  SPEED: ${speedPct}%`,
    blX,
    stY + 28
  );

  // --- BOTTOM RIGHT: ACTIVE BLASTER & AMMO ---
  const brX = width - 280;
  const brY = height - 90;

  ctx.fillStyle = "rgba(10, 14, 20, 0.75)";
  ctx.fillRect(brX, brY - 14, 260, 88);
  ctx.strokeStyle = "rgba(0, 210, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(brX, brY - 14, 260, 88);

  // Weapon Name & Slot indicator
  ctx.fillStyle = weaponDef.color || "#00d2ff";
  ctx.font = "bold 15px 'Chakra Petch', sans-serif";
  ctx.fillText(`${weaponDef.name || "None"}`, brX + 14, brY + 4);

  // Ammo readout
  if (weaponDef.isMelee) {
    ctx.fillStyle = "#2ed573";
    ctx.font = "bold 18px 'Chakra Petch', sans-serif";
    ctx.fillText("FOAM BLADE", brX + 14, brY + 34);
  } else if (weaponDef.isGadget) {
    ctx.fillStyle = "#ffa502";
    ctx.font = "bold 16px 'Chakra Petch', sans-serif";
    if (weaponDef.requiresDartLoadCount) {
      const avail = player.reserveAmmo[weaponDef.shrapnelAmmoType || "elite_dart"] || 0;
      ctx.fillText(`LOADED: ${avail}/${weaponDef.requiresDartLoadCount}`, brX + 14, brY + 34);
    } else {
      ctx.fillText("TACTICAL GADGET", brX + 14, brY + 34);
    }
  } else {
    const inMag = player.magAmmo[currentWeaponKey] || 0;
    const reserve = player.reserveAmmo[weaponDef.ammoType] || 0;

    ctx.fillStyle = inMag > 0 ? "#ffffff" : "#ff4757";
    ctx.font = "bold 24px 'Chakra Petch', monospace";
    ctx.fillText(`${inMag}`, brX + 14, brY + 38);

    ctx.fillStyle = "#747d8c";
    ctx.font = "bold 14px 'Chakra Petch', monospace";
    ctx.fillText(` / ${reserve}`, brX + 54, brY + 38);

    if (player.isReloading) {
      const reloadPct = 1 - player.reloadTimerMs / (weaponDef.reloadTime || 1200);
      ctx.fillStyle = "#ffaa00";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`RELOADING (${Math.round(reloadPct * 100)}%)`, brX + 120, brY + 38);
    }
  }

  // Weapon slot keys hint (1, 2, 3)
  ctx.fillStyle = "#747d8c";
  ctx.font = "10px 'Chakra Petch', sans-serif";
  ctx.fillText(`SLOTS [1-3]  |  [R] RELOAD  |  [SPACE] FLIP  |  [E] INTERACT`, brX + 14, brY + 62);

  // --- TOP CENTER: SCORE & TAGS ---
  ctx.fillStyle = "rgba(10, 14, 20, 0.7)";
  ctx.fillRect(width / 2 - 100, 14, 200, 36);
  ctx.strokeStyle = "rgba(0, 210, 255, 0.25)";
  ctx.strokeRect(width / 2 - 100, 14, 200, 36);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px 'Chakra Petch', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`SCORE: ${player.score}  |  TAGS: ${player.tagsDealt}`, width / 2, 37);

  ctx.restore();
}
// === SECTION: HUD_AND_RETICLE END ===

// === SECTION: MASTER_RENDER_LOOP START ===
/**
 * Master Canvas Rendering Function called every animation frame.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {object} state
 * @param {string} localPlayerId
 * @param {Camera} camera
 * @param {ParticlePool} particles
 * @param {{x: number, y: number}} mousePos
 */
export function renderGame(ctx, width, height, state, localPlayerId, camera, particles, mousePos) {
  // Clear screen
  ctx.clearRect(0, 0, width, height);
  if (!state || !state.map) return;

  const localPlayer = state.players.get(localPlayerId);
  if (localPlayer) {
    camera.update(localPlayer.x, localPlayer.y);
  }

  // Camera world transform
  const cam = camera.getOffset(width, height);
  ctx.save();
  ctx.translate(cam.x, cam.y);

  // 1. Render Map Arena Tiles & Spawns
  renderMap(ctx, state.map);

  // 2. Render Projectiles (Airborne & Grounded) + Floor Loot
  renderProjectilesAndLoot(ctx, state.projectiles, state.floorLoot, localPlayer);

  // 3. Render Tactical Operatives & Blasters
  renderPlayers(ctx, state.players, localPlayerId);

  // 4. Render Particle Bursts
  particles.render(ctx);

  ctx.restore();

  // 5. Render Screen-space HUD & Reticle
  renderHUD(ctx, width, height, localPlayer, camera, mousePos);
}
// === SECTION: MASTER_RENDER_LOOP END ===
