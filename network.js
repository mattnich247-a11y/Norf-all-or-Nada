/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// =============================================================================
// FOAM STRIKE: TACTICAL FOAM-DART SHOOTER - NETWORK & CLIENT CONTROLLER
// PeerJS Host-Authoritative Multiplayer, Web Audio Synthesis, & lil-gui Live Tuning
// STRICT ARCHITECTURAL RULE: SECTION FENCES FOR ISOLATED EDITABILITY
// =============================================================================

import { GLOBAL_CONFIG, AMMO_TYPES, WEAPONS, LOOT_CONFIG, MAPS } from "./config.js";
import {
  createInitialGameState,
  spawnPlayer,
  updatePhysics,
  pickWeightedItem,
} from "./physics.js";
import { Camera, ParticlePool, renderGame } from "./render.js";

// === SECTION: PROCEDURAL_AUDIO START ===
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playPop(freq = 320, duration = 0.08) {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (_) {}
  }

  playClick() {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.03);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.03);
    } catch (_) {}
  }

  playWhoosh() {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + 0.15);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (_) {}
  }

  playThwack() {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.07);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.07);
    } catch (_) {}
  }

  playExplosion() {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(80, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch (_) {}
  }
}
// === SECTION: PROCEDURAL_AUDIO END ===

// === SECTION: LIVE_TUNING_GUI START ===
/**
 * Binds GLOBAL_CONFIG, LOOT_CONFIG, visual mode, and equipped blasters to lil-gui inside a dedicated non-overlapping wrapper.
 * @param {object} gameController
 */
export function setupTuningGui(gameController) {
  const GUI = window.lil?.GUI;
  if (!GUI) return null;

  const container = document.getElementById("tuningGuiWrapper");
  const gui = new GUI({
    title: "Foam Strike Physics Tuning",
    container: container || undefined,
    autoPlace: !container,
    width: 270,
  });

  // 1. Visual Mode & Test Arena Folder
  const testFolder = gui.addFolder("Playground & Display");
  testFolder
    .add(GLOBAL_CONFIG, "visualMode", ["tactical", "basic"])
    .name("Visual Style")
    .onChange((val) => {
      gameController.showToast(`Display style: ${val.toUpperCase()}`);
      const btn = document.getElementById("styleToggleBtn");
      if (btn) btn.textContent = val === "basic" ? "🎨 BASIC STYLE" : "🎨 TACTICAL STYLE";
    });

  const mapActions = {
    loadPlayground: () => gameController.switchMap("testing_playground"),
    loadWarzone: () => gameController.switchMap("living_room_warzone"),
  };
  testFolder.add(mapActions, "loadPlayground").name("🧪 Open Test Range");
  testFolder.add(mapActions, "loadWarzone").name("🏠 Open Warzone Arena");

  // 2. Core Physics Folder
  const physFolder = gui.addFolder("Player & Movement");
  physFolder.add(GLOBAL_CONFIG, "playerBaseSpeed", 1.0, 8.0, 0.1).name("Base Speed");
  physFolder.add(GLOBAL_CONFIG, "playerBaseHp", 20, 200, 5).name("Base Max HP");
  physFolder.add(GLOBAL_CONFIG, "maxLoadoutWeight", 5.0, 25.0, 0.5).name("Max Weight (kg)");
  physFolder.add(GLOBAL_CONFIG, "weightSpeedPenaltyFactor", 0.01, 0.1, 0.005).name("Weight Penalty");
  physFolder.add(GLOBAL_CONFIG, "crouchSpeedMultiplier", 0.2, 0.9, 0.05).name("Crouch Multiplier");

  // 3. Stamina & Front-Flip Folder
  const flipFolder = gui.addFolder("Stamina & Front Flip");
  flipFolder.add(GLOBAL_CONFIG, "maxStamina", 50, 200, 10).name("Max Stamina");
  flipFolder.add(GLOBAL_CONFIG, "staminaRegenRate", 2, 40, 1).name("Stamina Regen /s");
  flipFolder.add(GLOBAL_CONFIG, "sprintCost", 5, 50, 1).name("Sprint Cost /s");
  flipFolder.add(GLOBAL_CONFIG, "sprintMultiplier", 1.1, 2.0, 0.05).name("Sprint Multiplier");
  flipFolder.add(GLOBAL_CONFIG, "flipCost", 10, 80, 5).name("Flip Cost");
  flipFolder.add(GLOBAL_CONFIG, "flipDurationMs", 150, 700, 25).name("Flip Duration (ms)");
  flipFolder.add(GLOBAL_CONFIG, "flipSpeedMultiplier", 1.5, 4.0, 0.1).name("Flip Speed Boost");

  // 4. Loot & Scavenging Folder
  const lootFolder = gui.addFolder("Loot & Scavenging");
  lootFolder.add(GLOBAL_CONFIG, "groundScavengeRadius", 10, 60, 2).name("Scavenge Radius (px)");
  lootFolder.add(LOOT_CONFIG, "initialRandomFloorChance", 0.0, 2, 2).name("Floor Scatter Chance");
  lootFolder.add(LOOT_CONFIG, "ammoVsWeaponRatio", 0.1, 0.9, 0.05).name("Ammo vs Gun Ratio");
  lootFolder.add(LOOT_CONFIG, "weaponRespawnInterval", 10, 360, 10).name("Gun Pad Reload (s)");
  lootFolder.add(LOOT_CONFIG, "ammoRespawnInterval", 10, 360, 10).name("Ammo Pad Reload (s)");

  // 5. Blaster Stats Folder (Dynamically adjusts active weapons)
  const weaponFolder = gui.addFolder("Selected Blaster Stats");
  const weaponObj = {
    selected: "jolt_pistol",
    damage: 60,
    fireCooldown: 700,
    spread: 0.02,
    weight: 0.8,
  };

  const updateWeaponFolder = (wKey) => {
    const w = WEAPONS[wKey];
    if (w) {
      weaponObj.selected = wKey;
      weaponObj.damage = w.damage || 0;
      weaponObj.fireCooldown = w.fireCooldown || 0;
      weaponObj.spread = w.spread || 0;
      weaponObj.weight = w.weight || 0;
    }
  };

  weaponFolder
    .add(weaponObj, "selected", Object.keys(WEAPONS))
    .name("Weapon")
    .onChange((val) => updateWeaponFolder(val));

  weaponFolder.add(weaponObj, "damage", 1, 120, 1).onChange((val) => {
    if (WEAPONS[weaponObj.selected]) WEAPONS[weaponObj.selected].damage = val;
  });
  weaponFolder.add(weaponObj, "fireCooldown", 40, 2000, 10).onChange((val) => {
    if (WEAPONS[weaponObj.selected]) WEAPONS[weaponObj.selected].fireCooldown = val;
  });
  weaponFolder.add(weaponObj, "spread", 0.0, 0.3, 0.005).onChange((val) => {
    if (WEAPONS[weaponObj.selected]) WEAPONS[weaponObj.selected].spread = val;
  });
  weaponFolder.add(weaponObj, "weight", 0.5, 10.0, 0.1).onChange((val) => {
    if (WEAPONS[weaponObj.selected]) WEAPONS[weaponObj.selected].weight = val;
  });

  // 6. Zero-Token Export Button
  const exportBtn = {
    exportToClipboard: () => {
      const code = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GLOBAL_CONFIG = ${JSON.stringify(GLOBAL_CONFIG, null, 2)};

export const AMMO_TYPES = ${JSON.stringify(AMMO_TYPES, null, 2)};

export const WEAPONS = ${JSON.stringify(WEAPONS, null, 2)};

export const LOOT_CONFIG = ${JSON.stringify(LOOT_CONFIG, null, 2)};

export const MAPS = ${JSON.stringify(MAPS, null, 2)};
`;
      navigator.clipboard.writeText(code).then(() => {
        gameController.showToast("Tuned config.js exported to clipboard!");
      });
    },
  };

  gui.add(exportBtn, "exportToClipboard").name("Export config.js to Clipboard");

  return gui;
}
// === SECTION: LIVE_TUNING_GUI END ===

// === SECTION: INPUT_CONTROLLER START ===
export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mousePos = { x: 0, y: 0 };
    this.firing = false;
    this.revving = false;
    this.reloading = false;
    this.flipPressed = false;
    this.interactPressed = false;
    this.weaponSlot = 0;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onContextMenu = (e) => e.preventDefault();

    this.attach();
  }

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("contextmenu", this.onContextMenu);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("contextmenu", this.onContextMenu);
  }

  onKeyDown(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    this.keys[e.code] = true;

    if (e.code === "Space") {
      this.flipPressed = true;
      e.preventDefault();
    }
    if (e.code === "KeyE") {
      this.interactPressed = true;
    }
    if (e.code === "KeyR") {
      this.reloading = true;
    }
    if (e.code === "KeyT" || e.code === "Backquote") {
      if (this.onToggleTuning) this.onToggleTuning();
    }
    if (e.code === "Digit1") this.weaponSlot = 0;
    if (e.code === "Digit2") this.weaponSlot = 1;
    if (e.code === "Digit3") this.weaponSlot = 2;
  }

  onKeyUp(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.keys[e.code] = false;
    if (e.code === "KeyR") {
      this.reloading = false;
    }
  }

  onMouseDown(e) {
    if (e.button === 0) {
      this.firing = true;
    } else if (e.button === 2) {
      this.revving = true;
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      this.firing = false;
    } else if (e.button === 2) {
      this.revving = false;
    }
  }

  onMouseMove(e) {
    this.mousePos.x = e.clientX;
    this.mousePos.y = e.clientY;
  }

  /**
   * Consumes single-frame triggers and returns the current input snapshot.
   */
  getSnapshot(player, camera, canvasWidth, canvasHeight) {
    let aimAngle = 0;
    if (player && camera) {
      const cam = camera.getOffset(canvasWidth, canvasHeight);
      const playerScreenX = player.x + cam.x;
      const playerScreenY = player.y + cam.y;
      aimAngle = Math.atan2(this.mousePos.y - playerScreenY, this.mousePos.x - playerScreenX);
    }

    const snapshot = {
      keys: { ...this.keys },
      aimAngle,
      firing: this.firing,
      revving: this.revving,
      reloading: this.reloading,
      flipPressed: this.flipPressed,
      interactPressed: this.interactPressed,
      weaponSlot: this.weaponSlot,
    };

    // Reset edge-triggered inputs
    this.flipPressed = false;
    this.interactPressed = false;

    return snapshot;
  }
}
// === SECTION: INPUT_CONTROLLER END ===

// === SECTION: PEERJS_NETWORK_SYNC START ===
/**
 * Master Game Controller handling Host / Client networking, local simulation, bots, and rendering.
 */
export class GameController {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.camera = new Camera();
    this.particles = new ParticlePool();
    this.sound = new SoundEngine();
    this.input = new InputController(this.canvas);
    this.currentMapName = "living_room_warzone";

    this.input.onToggleTuning = () => this.toggleTuningGui();

    // Networking
    this.peer = null;
    this.connections = new Map(); // peerId -> DataConnection
    this.isHost = true;
    this.localPlayerId = "host";
    this.roomCode = "";

    // Authoritative State (Managed by Host) - Pre-initialized so Canvas is immediately rendering
    this.authoritativeState = createInitialGameState(this.currentMapName);
    spawnPlayer(this.authoritativeState, "host", "Dart-Striker", "jolt_pistol", "foam_grenade");
    this.clientInputs = new Map(); // playerId -> InputSnapshot
    this.lastTickTime = performance.now();
    this.fixedDtMs = 1000 / GLOBAL_CONFIG.tickRate;

    // AI Bots for Solo Practice
    this.bots = [];
    this.botEnabled = true;

    // UI Toast
    this.toastTimer = null;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    setupTuningGui(this);
    this.startLoop();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("opacity-0");
    toast.classList.add("opacity-100");

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("opacity-100");
      toast.classList.add("opacity-0");
    }, 2800);
  }

  toggleTuningGui() {
    const wrapper = document.getElementById("tuningGuiWrapper");
    if (!wrapper) return;
    const isHidden = wrapper.style.display === "none" || getComputedStyle(wrapper).display === "none";
    wrapper.style.display = isHidden ? "block" : "none";
    const btn = document.getElementById("tuningToggleBtn");
    if (btn) {
      if (isHidden) {
        btn.classList.add("bg-orange-600", "border-orange-500");
      } else {
        btn.classList.remove("bg-orange-600", "border-orange-500");
      }
    }
  }

  toggleVisualStyle() {
    GLOBAL_CONFIG.visualMode = GLOBAL_CONFIG.visualMode === "basic" ? "tactical" : "basic";
    const btn = document.getElementById("styleToggleBtn");
    if (btn) {
      btn.textContent = GLOBAL_CONFIG.visualMode === "basic" ? "🎨 BASIC STYLE" : "🎨 TACTICAL STYLE";
    }
    this.showToast(`Display style: ${GLOBAL_CONFIG.visualMode.toUpperCase()}`);
  }

  switchMap(mapName = "testing_playground") {
    if (!this.isHost) {
      this.showToast("Only Host can switch maps.");
      return;
    }
    this.currentMapName = mapName;
    const localPlayer = this.authoritativeState?.players.get(this.localPlayerId);
    const primary = localPlayer?.weapons[0] || "jolt_pistol";
    const secondary = localPlayer?.weapons[1] || "foam_grenade";
    const name = localPlayer?.name || "Operative Host";

    this.authoritativeState = createInitialGameState(mapName);
    spawnPlayer(this.authoritativeState, this.localPlayerId, name, primary, secondary);

    if (this.botEnabled) {
      this.bots = [];
      this.spawnTrainingBot("Dummy Alpha", "burst_sniper", "foam_claymore");
      this.spawnTrainingBot("Dummy Beta", "rival_smg", "nerf_nuke");
    }

    // Broadcast new map to clients
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send({
          type: "init",
          map: this.authoritativeState.map,
          localPlayerId: conn.peer,
        });
      }
    }

    const title = mapName === "testing_playground" ? "Testing Playground" : "Warzone Arena";
    this.showToast(`Loaded: ${title}`);
    const playgroundBtn = document.getElementById("playgroundHudBtn");
    if (playgroundBtn) {
      playgroundBtn.textContent = mapName === "testing_playground" ? "🏠 WARZONE" : "🧪 PLAYGROUND";
    }
  }

  // -------------------------------------------------------------
  // HOST MODE INITIALIZATION
  // -------------------------------------------------------------
  startAsHost(primaryWeapon = "jolt_pistol", secondaryGadget = "foam_grenade", playerName = "Operative Host", mapName = "living_room_warzone") {
    this.isHost = true;
    this.localPlayerId = "host";
    this.currentMapName = mapName;
    this.sound.init();

    // Generate clean 6-character room code
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.roomCode = `FOAM-${randomCode}`;

    // Initialize Authoritative State
    this.authoritativeState = createInitialGameState(this.currentMapName);
    spawnPlayer(this.authoritativeState, "host", playerName, primaryWeapon, secondaryGadget);

    // Spawn 2 Tactical Training Bots for immediate solo practice!
    if (this.botEnabled) {
      this.spawnTrainingBot("Target Dummy Alpha", "burst_sniper", "foam_claymore");
      this.spawnTrainingBot("Target Dummy Beta", "rival_smg", "nerf_nuke");
    }

    // Initialize PeerJS
    const PeerClass = window.Peer;
    if (PeerClass) {
      try {
        this.peer = new PeerClass(this.roomCode);
        this.peer.on("open", (id) => {
          this.roomCode = id;
          this.updateRoomCodeUI(id);
          this.showToast(`Hosting room: ${id}`);
        });

        this.peer.on("connection", (conn) => {
          this.setupHostConnection(conn);
        });

        this.peer.on("error", (err) => {
          console.warn("PeerJS host warning:", err);
          this.showToast(`Hosting offline / Local simulation ready.`);
        });
      } catch (err) {
        console.warn("PeerJS initialization failed:", err);
      }
    }

    this.hideLobbyOverlay();
  }

  setupHostConnection(conn) {
    const peerId = conn.peer;
    this.connections.set(peerId, conn);

    conn.on("open", () => {
      // Spawn new client player
      const clientPlayer = spawnPlayer(
        this.authoritativeState,
        peerId,
        `Agent-${peerId.substring(0, 4)}`,
        "rival_smg",
        "foam_grenade"
      );
      this.showToast(`Player ${clientPlayer.name} joined!`);

      // Send initial map & full state
      conn.send({
        type: "init",
        map: this.authoritativeState.map,
        localPlayerId: peerId,
      });
    });

    conn.on("data", (data) => {
      if (data.type === "input") {
        this.clientInputs.set(peerId, data.snapshot);
      }
    });

    conn.on("close", () => {
      this.authoritativeState.players.delete(peerId);
      this.clientInputs.delete(peerId);
      this.connections.delete(peerId);
      this.showToast(`Player ${peerId} disconnected.`);
    });
  }

  // -------------------------------------------------------------
  // CLIENT MODE INITIALIZATION
  // -------------------------------------------------------------
  joinRoom(targetRoomCode, primaryWeapon = "jolt_pistol", secondaryGadget = "foam_grenade", playerName = "Operative Client") {
    this.isHost = false;
    this.sound.init();
    this.roomCode = targetRoomCode.trim();

    const PeerClass = window.Peer;
    if (!PeerClass) {
      alert("PeerJS library not loaded. Please check your connection.");
      return;
    }

    this.peer = new PeerClass();
    this.peer.on("open", (myId) => {
      this.localPlayerId = myId;
      const conn = this.peer.connect(this.roomCode, { reliable: true });

      conn.on("open", () => {
        this.hostConn = conn;
        this.showToast(`Connected to Host ${this.roomCode}!`);
        this.hideLobbyOverlay();
        this.updateRoomCodeUI(this.roomCode);
      });

      conn.on("data", (data) => {
        if (data.type === "init") {
          this.authoritativeState = {
            map: data.map,
            players: new Map(),
            projectiles: [],
            floorLoot: [],
            events: [],
          };
          this.localPlayerId = data.localPlayerId;
        } else if (data.type === "state_snapshot") {
          this.applyStateSnapshot(data.snapshot);
        }
      });

      conn.on("error", (err) => {
        this.showToast(`Connection error: ${err.message}`);
      });
    });
  }

  // -------------------------------------------------------------
  // STATE SYNC & BOT LOGIC
  // -------------------------------------------------------------
  spawnTrainingBot(name, primary, secondary) {
    const botId = `bot_${this.authoritativeState.nextEntityId++}`;
    spawnPlayer(this.authoritativeState, botId, name, primary, secondary);
    this.bots.push(botId);
  }

  updateBots(dtMs) {
    const hostPlayer = this.authoritativeState.players.get("host");
    if (!hostPlayer) return;

    for (const botId of this.bots) {
      const bot = this.authoritativeState.players.get(botId);
      if (!bot || bot.isTaggedOut) continue;

      const dx = hostPlayer.x - bot.x;
      const dy = hostPlayer.y - bot.y;
      const dist = Math.hypot(dx, dy);
      const angleToHost = Math.atan2(dy, dx);

      const keys = {};
      let firing = false;
      let flip = false;

      // Move toward host if too far, strafe if close
      if (dist > 180) {
        if (dx > 20) keys.KeyD = true;
        if (dx < -20) keys.KeyA = true;
        if (dy > 20) keys.KeyS = true;
        if (dy < -20) keys.KeyW = true;
      } else if (dist < 90) {
        // Back up
        if (dx > 0) keys.KeyA = true;
        else keys.KeyD = true;
        if (dy > 0) keys.KeyW = true;
        else keys.KeyS = true;
      } else {
        // Strafe
        keys.KeyA = Math.sin(this.authoritativeState.tick * 0.05) > 0;
        keys.KeyD = !keys.KeyA;
      }

      // Check vaulting over couch (=)
      const r = Math.floor(bot.y / GLOBAL_CONFIG.tileSize);
      const c = Math.floor(bot.x / GLOBAL_CONFIG.tileSize);
      if (this.authoritativeState.map.tiles[r]?.[c] === "=" && bot.stamina >= 50) {
        flip = true;
      }

      // Fire blaster when in range
      if (dist < 320 && Math.random() < 0.25) {
        firing = false;
      }

      this.clientInputs.set(botId, {
        keys,
        aimAngle: angleToHost,
        firing,
        revving: true,
        reloading: false,
        flipPressed: flip,
        interactPressed: Math.random() < 0.05,
        weaponSlot: 0,
      });
    }
  }

  broadcastState() {
    if (!this.isHost || this.connections.size === 0) return;

    const snapshot = {
      tick: this.authoritativeState.tick,
      players: Array.from(this.authoritativeState.players.entries()),
      projectiles: this.authoritativeState.projectiles,
      floorLoot: this.authoritativeState.floorLoot,
      boxes: Array.from(this.authoritativeState.map.boxes.entries()),
      events: this.authoritativeState.events,
    };

    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send({
          type: "state_snapshot",
          snapshot,
        });
      }
    }
  }

  applyStateSnapshot(snapshot) {
    if (!this.authoritativeState) return;
    this.authoritativeState.tick = snapshot.tick;
    this.authoritativeState.players = new Map(snapshot.players);
    this.authoritativeState.projectiles = snapshot.projectiles;
    this.authoritativeState.floorLoot = snapshot.floorLoot;

    if (snapshot.boxes) {
      this.authoritativeState.map.boxes = new Map(snapshot.boxes);
    }

    if (snapshot.events) {
      this.processEvents(snapshot.events);
    }
  }

  processEvents(events) {
    for (const ev of events) {
      if (ev.type === "blaster_fire") {
        this.sound.playPop(ev.ammoType === "rival_ball" ? 440 : 320);
        this.particles.spawnMuzzleFlash(ev.x, ev.y, ev.angle);
      } else if (ev.type === "player_tagged") {
        this.sound.playThwack();
        this.particles.spawnHitSparks(ev.x, ev.y, "#ff4757");
        this.particles.spawnPopText(ev.x, ev.y - 10, `-${ev.damage} HIT!`, "#ff4757");
      } else if (ev.type === "scavenge_dart" || ev.type === "scavenge_ammo_pack") {
        this.sound.playClick();
        this.particles.spawnPopText(ev.x, ev.y, "+DART", "#00d2ff");
      } else if (ev.type === "front_flip") {
        this.sound.playWhoosh();
      } else if (ev.type === "nuke_detonated" || ev.type === "grenade_detonated") {
        this.sound.playExplosion();
        this.camera.addShake(15);
      } else if (ev.type === "claymore_triggered") {
        this.sound.playClick();
      } else if (ev.type === "spring_prime") {
        this.sound.playClick();
      }
    }
  }

  // -------------------------------------------------------------
  // MASTER GAME LOOP
  // -------------------------------------------------------------
  startLoop() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = now - this.lastTickTime;
      this.lastTickTime = now;

      // 1. Gather Local Input Snapshot
      if (this.authoritativeState) {
        const localPlayer = this.authoritativeState.players.get(this.localPlayerId);
        const localSnapshot = this.input.getSnapshot(
          localPlayer,
          this.camera,
          this.canvas.width,
          this.canvas.height
        );

        if (this.isHost) {
          this.clientInputs.set(this.localPlayerId, localSnapshot);
          this.updateBots(this.fixedDtMs);

          // Authoritative Physics Simulation
          updatePhysics(this.authoritativeState, this.fixedDtMs, this.clientInputs);
          this.processEvents(this.authoritativeState.events);
          this.broadcastState();
        } else if (this.hostConn && this.hostConn.open) {
          // Client sends snapshot to host
          this.hostConn.send({
            type: "input",
            snapshot: localSnapshot,
          });
        }
      }

      // 2. Render Scene & HUD
      this.particles.update();
      renderGame(
        this.ctx,
        this.canvas.width,
        this.canvas.height,
        this.authoritativeState,
        this.localPlayerId,
        this.camera,
        this.particles,
        this.input.mousePos
      );
    };

    requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------
  // UI HELPERS
  // -------------------------------------------------------------
  hideLobbyOverlay() {
    const overlay = document.getElementById("lobbyOverlay");
    if (overlay) overlay.style.display = "none";
  }

  showLobbyOverlay() {
    const overlay = document.getElementById("lobbyOverlay");
    if (overlay) overlay.style.display = "flex";
  }

  updateRoomCodeUI(code) {
    const codeDisplay = document.getElementById("roomCodeDisplay");
    const codeText = document.getElementById("roomCodeText");
    if (codeDisplay && codeText) {
      codeText.textContent = code;
      codeDisplay.classList.remove("hidden");
    }
  }
}
// === SECTION: PEERJS_NETWORK_SYNC END ===

// === SECTION: ENTRY_POINT START ===
function initApp() {
  const controller = new GameController();

  // Bind UI buttons
  const hostBtn = document.getElementById("hostBtn");
  const joinBtn = document.getElementById("joinBtn");
  const soloBtn = document.getElementById("soloBtn");
  const copyRoomBtn = document.getElementById("copyRoomBtn");
  const muteBtn = document.getElementById("muteBtn");

  const primarySelect = document.getElementById("primarySelect");
  const secondarySelect = document.getElementById("secondarySelect");
  const playerNameInput = document.getElementById("playerNameInput");
  const roomCodeInput = document.getElementById("roomCodeInput");

  // Loadout Weight Preview Update
  const updateWeightPreview = () => {
    const pKey = primarySelect?.value || "jolt_pistol";
    const sKey = secondarySelect?.value || "foam_grenade";
    const pWeight = WEAPONS[pKey]?.weight || 0;
    const sWeight = WEAPONS[sKey]?.weight || 0;
    const total = pWeight + sWeight;

    const penaltyFactor = GLOBAL_CONFIG.weightSpeedPenaltyFactor || 0.04;
    const speedRatio = Math.max(GLOBAL_CONFIG.minSpeedRatio, 1 - total * penaltyFactor);
    const speedPct = Math.round(speedRatio * 100);

    const weightDisplay = document.getElementById("loadoutWeightDisplay");
    if (weightDisplay) {
      weightDisplay.textContent = `Total Weight: ${total.toFixed(1)} / ${GLOBAL_CONFIG.maxLoadoutWeight} kg  (Speed: ${speedPct}%)`;
    }
  };

  primarySelect?.addEventListener("change", updateWeightPreview);
  secondarySelect?.addEventListener("change", updateWeightPreview);
  updateWeightPreview();

  const mapSelect = document.getElementById("mapSelect");
  const tuningToggleBtn = document.getElementById("tuningToggleBtn");
  const styleToggleBtn = document.getElementById("styleToggleBtn");
  const playgroundHudBtn = document.getElementById("playgroundHudBtn");
  const playgroundLobbyBtn = document.getElementById("playgroundLobbyBtn");

  hostBtn?.addEventListener("click", () => {
    const p = primarySelect?.value || "jolt_pistol";
    const s = secondarySelect?.value || "foam_grenade";
    const name = playerNameInput?.value.trim() || "Host Operative";
    const map = mapSelect?.value || "living_room_warzone";
    controller.startAsHost(p, s, name, map);
  });

  soloBtn?.addEventListener("click", () => {
    const p = primarySelect?.value || "jolt_pistol";
    const s = secondarySelect?.value || "foam_grenade";
    const name = playerNameInput?.value.trim() || "Solo Ranger";
    const map = mapSelect?.value || "living_room_warzone";
    controller.startAsHost(p, s, name, map);
  });

  playgroundLobbyBtn?.addEventListener("click", () => {
    const p = primarySelect?.value || "jolt_pistol";
    const s = secondarySelect?.value || "foam_grenade";
    const name = playerNameInput?.value.trim() || "Test Specialist";
    GLOBAL_CONFIG.visualMode = "basic";
    if (styleToggleBtn) styleToggleBtn.textContent = "🎨 BASIC STYLE";
    controller.startAsHost(p, s, name, "testing_playground");
  });

  playgroundHudBtn?.addEventListener("click", () => {
    const nextMap = controller.currentMapName === "testing_playground" ? "living_room_warzone" : "testing_playground";
    controller.switchMap(nextMap);
  });

  tuningToggleBtn?.addEventListener("click", () => {
    controller.toggleTuningGui();
  });

  styleToggleBtn?.addEventListener("click", () => {
    controller.toggleVisualStyle();
  });

  joinBtn?.addEventListener("click", () => {
    const code = roomCodeInput?.value.trim();
    if (!code) {
      alert("Please enter a valid Host Room Code.");
      return;
    }
    const p = primarySelect?.value || "jolt_pistol";
    const s = secondarySelect?.value || "foam_grenade";
    const name = playerNameInput?.value.trim() || "Guest Operative";
    controller.joinRoom(code, p, s, name);
  });

  copyRoomBtn?.addEventListener("click", () => {
    if (controller.roomCode) {
      navigator.clipboard.writeText(controller.roomCode).then(() => {
        controller.showToast("Room code copied to clipboard!");
      });
    }
  });

  muteBtn?.addEventListener("click", () => {
    const muted = controller.sound.toggleMute();
    muteBtn.textContent = muted ? "🔇 MUTED" : "🔊 SOUND ON";
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
// === SECTION: ENTRY_POINT END ===
