import { DurableObject } from "cloudflare:workers";
import { apiPreflight, handleApiRequest } from "./api";
import type { Env } from "./env";
import {
	DAMAGE_COOLDOWN_MS,
	MAX_BOT_KILL_EVENTS_PER_SEC,
	MAX_DAMAGE_EVENTS_PER_SEC,
	MAX_JSON_BYTES,
	MAX_MESSAGES_PER_SEC,
	RESPAWN_COOLDOWN_MS,
  sanitizeAnim,
  sanitizeBloodCount,
  sanitizeDamage,
  MAX_USERNAME_LEN,
  sanitizeQuat,
  sanitizeSlot,
  sanitizeSoundName,
  sanitizeUsername,
  sanitizeVec3,
  sanitizeViewYaw,
	sanitizeViewPitch,
	sanitizeVolume,
	sanitizeWeapon,
	isValidPlayerId,
	MAX_BULLET_DIST,
	FIRE_WINDOW_MS,
} from "./validation";

export type { Env } from "./env";

type PlayerRecord = {
	id: string;
	username: string;
	pos: { x: number; y: number; z: number };
	quat: { x: number; y: number; z: number; w: number };
	viewYaw: number;
	viewPitch: number;
	kills: number;
	botKills: number;
	anim: string;
	slot: number;
	atMenu: boolean;
	health: number;
	maxHealth: number;
	lastUpdate: number;
	lastFireAt: number;
	lastDamageWeapon?: string;
	lastRespawnAt?: number;
};

type BotRecord = {
	id: string;
	health: number;
	maxHealth: number;
	pos: { x: number; y: number; z: number };
	lastRespawnAt: number;
};

function playerPublic(p: PlayerRecord): Record<string, unknown> {
	return {
		id: p.id,
		username: p.username,
		pos: p.pos,
		quat: p.quat,
		viewYaw: p.viewYaw,
		viewPitch: p.viewPitch,
		kills: p.kills,
		botKills: p.botKills,
		anim: p.anim,
		slot: p.slot,
		atMenu: p.atMenu,
		health: p.health,
		maxHealth: p.maxHealth,
		lastUpdate: p.lastUpdate,
	};
}

/**
 * Worker Entry Point
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			if (request.method === "OPTIONS") {
				return apiPreflight(request, env);
			}
			return handleApiRequest(request, env);
		}

		// Sequential Room Filling Logic (max 8 per room)
		let roomToJoin = "room_1";
		for (let i = 1; i <= 100; i++) {
			const roomName = `room_${i}`;
			const id = env.GAME_ROOM.idFromName(roomName);
			const room = env.GAME_ROOM.get(id);
			
			try {
				const countRes = await room.fetch("http://game/player-count");
				const count = parseInt(await countRes.text());
				if (count < 8) {
					roomToJoin = roomName;
					break;
				}
			} catch {
				// If room fails to respond, assume it's new/empty or just join it
				roomToJoin = roomName;
				break;
			}
		}

		const id = env.GAME_ROOM.idFromName(roomToJoin);
		const room = env.GAME_ROOM.get(id);

		// Clone request to add room name header
		const newReq = new Request(request);
		newReq.headers.set("X-Room-Name", roomToJoin);

		return room.fetch(newReq);
	},
};

/**
 * Durable Object: GameRoom
 */
const MATCH_DURATION_MS = 3 * 60 * 1000;
const RESET_DELAY_MS = 10000;

export class GameRoom extends DurableObject<Env> {
	private env: Env;
	private players = new Map<string, PlayerRecord>();
	private bots = new Map<string, BotRecord>();
	private sessions = new Set<WebSocket>();
	private playerSockets = new Map<string, WebSocket>();
	private matchStartTime: number;
	private readonly treeLayout: Array<{ phi: number; theta: number; scale: number }>;
	private readonly initialTrainPhase: number;
	private readonly tentLayout: Array<{ phi: number; theta: number }>;
	/** General inbound rate: timestamps (ms) in the last 1s per player */
	private inboundTs = new Map<string, number[]>();
	/** Damage events per attacker per rolling second */
	private damageTs = new Map<string, number[]>();
	/** Last damage time attacker→target to block burst exploits */
	private lastDamagePairMs = new Map<string, number>();
	private botKillTs = new Map<string, number[]>();
	private joinTimes = new Map<string, number>();

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.env = env;
		this.matchStartTime = Date.now();
		this.treeLayout = this.generateTreeLayout(80, 50, 8);
		this.tentLayout = this.generateTentLayout(3, 50, 8);
		this.initialTrainPhase = Math.random() * Math.PI * 2;
		
		// Initialize bots
		for (let i = 0; i < 12; i++) {
			const id = `bot_${i}`;
			this.bots.set(id, {
				id,
				health: 100,
				maxHealth: 100,
				pos: { x: 0, y: -50, z: 0 },
				lastRespawnAt: 0
			});
		}
	}

	private generateTentLayout(count: number, sphereRadius: number, safeZoneRadius: number) {
		const tents: Array<{ phi: number; theta: number }> = [];
		const spawnPos = { x: 0, y: -sphereRadius, z: 0 };
		const trainPhi = Math.PI / 2;
		const trainHalfWidth = 0.36;

		while (tents.length < count) {
			const phi = Math.random() * Math.PI;
			const theta = Math.random() * Math.PI * 2;
			if (Math.abs(phi - trainPhi) < trainHalfWidth) continue;
			
			const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
			const y = sphereRadius * Math.cos(phi);
			const z = sphereRadius * Math.sin(phi) * Math.sin(theta);
			
			const dx = x - spawnPos.x;
			const dy = y - spawnPos.y;
			const dz = z - spawnPos.z;
			const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
			if (dist < safeZoneRadius) continue;

			tents.push({ phi, theta });
		}
		return tents;
	}

	private getCurrentTrainPhase(): number {
		const speed = 1.0; // Keep in sync with TRAIN_VEHICLE_SPEED in client
		// Use a fixed epoch (Date.now() / 1000) for global synchronization.
		// This ensures the phase is identical for all players and stable across match resets.
		return (this.initialTrainPhase - (Date.now() / 1000) * speed);
	}

	async fetch(request: Request): Promise<Response> {
		try {
			const url = new URL(request.url);
			if (url.pathname === "/player-count") {
				return new Response(this.players.size.toString());
			}

			const roomName = request.headers.get("X-Room-Name") ?? "global";

			const upgradeHeader = request.headers.get("Upgrade");
			if (!upgradeHeader || upgradeHeader !== "websocket") {
				return new Response("Expected Upgrade: websocket", { status: 426 });
			}

			const [client, server] = new WebSocketPair();
			this.handleSession(server, roomName);

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		} catch (err) {
			console.error("GameRoom.fetch failed", err);
			return new Response("Internal error", { status: 500 });
		}
	}

	private allowInbound(playerId: string): boolean {
		const now = Date.now();
		let a = this.inboundTs.get(playerId) ?? [];
		a = a.filter((t) => now - t < 1000);
		if (a.length >= MAX_MESSAGES_PER_SEC) return false;
		a.push(now);
		this.inboundTs.set(playerId, a);
		return true;
	}

	private allowDamage(attackerId: string): boolean {
		const now = Date.now();
		let a = this.damageTs.get(attackerId) ?? [];
		a = a.filter((t) => now - t < 1000);
		if (a.length >= MAX_DAMAGE_EVENTS_PER_SEC) return false;
		a.push(now);
		this.damageTs.set(attackerId, a);
		return true;
	}

	private allowBotKill(playerId: string): boolean {
		const now = Date.now();
		let a = this.botKillTs.get(playerId) ?? [];
		a = a.filter((t) => now - t < 1000);
		if (a.length >= MAX_BOT_KILL_EVENTS_PER_SEC) return false;
		a.push(now);
		this.botKillTs.set(playerId, a);
		return true;
	}

	private cleanupRateState(playerId: string) {
		this.inboundTs.delete(playerId);
		this.damageTs.delete(playerId);
		this.botKillTs.delete(playerId);
		for (const k of [...this.lastDamagePairMs.keys()]) {
			if (k.startsWith(`${playerId}:`) || k.endsWith(`:${playerId}`)) {
				this.lastDamagePairMs.delete(k);
			}
		}
	}

	private isUsernameTaken(name: string, excludePlayerId: string): boolean {
		const key = name.toLowerCase();
		for (const [id, rec] of this.players) {
			if (id === excludePlayerId) continue;
			if (rec.username.toLowerCase() === key) return true;
		}
		return false;
	}

	/** Random unused `Player_XXX` with XXX in 001–999 (3 digits, no shared prefix + _2). */
	private pickUnusedPlayerTag(excludePlayerId: string): string {
		const used = new Set<number>();
		for (const [id, rec] of this.players) {
			if (id === excludePlayerId) continue;
			const m = rec.username.match(/^Player_(\d{3})$/i);
			if (m) used.add(parseInt(m[1]!, 10));
		}
		const pool: number[] = [];
		for (let n = 1; n <= 999; n++) {
			if (!used.has(n)) pool.push(n);
		}
		if (pool.length === 0) return this.emergencyUsername(excludePlayerId);
		const pick = pool[Math.floor(Math.random() * pool.length)]!;
		return `Player_${pick.toString().padStart(3, "0")}`;
	}

	private emergencyUsername(excludePlayerId: string): string {
		const slug = excludePlayerId.replace(/-/g, "").slice(0, 12);
		let fallback = `P_${slug}`.slice(0, MAX_USERNAME_LEN);
		if (!this.isUsernameTaken(fallback, excludePlayerId)) return fallback;
		for (let n = 2; n < 100; n++) {
			const suffix = `_${n}`;
			fallback = (`P_${slug}`).slice(0, MAX_USERNAME_LEN - suffix.length) + suffix;
			if (!this.isUsernameTaken(fallback, excludePlayerId)) return fallback;
		}
		return excludePlayerId.slice(0, MAX_USERNAME_LEN);
	}

	/**
	 * Case-insensitive uniqueness. `Player_<any digits>` collisions get a new free 3-digit tag,
	 * not `Player_1234_2`. Custom names still use numeric suffixes.
	 */
	private uniqueUsername(desired: string, excludePlayerId: string): string {
		let base = desired.trim().slice(0, MAX_USERNAME_LEN);
		if (!base) base = "Player";
		if (!this.isUsernameTaken(base, excludePlayerId)) return base;
		if (/^Player_\d+$/i.test(base)) {
			return this.pickUnusedPlayerTag(excludePlayerId);
		}
		for (let n = 2; n <= 9999; n++) {
			const suffix = `_${n}`;
			const maxBase = MAX_USERNAME_LEN - suffix.length;
			if (maxBase < 1) break;
			const candidate = base.slice(0, maxBase) + suffix;
			if (!this.isUsernameTaken(candidate, excludePlayerId)) return candidate;
		}
		return this.emergencyUsername(excludePlayerId);
	}

	handleSession(ws: WebSocket, roomName: string) {
		const playerId = crypto.randomUUID();
		this.sessions.add(ws);
		this.playerSockets.set(playerId, ws);
		this.joinTimes.set(playerId, Date.now());
		ws.accept();

		void this.sendDiscordNotification(
			"🎮 Player Joined",
			`A new player has entered the sphere.`,
			0x44ff44,
			[
				{ name: "Player ID", value: `\`${playerId.slice(0, 8)}\``, inline: true },
				{ name: "Room", value: `\`${roomName}\``, inline: true },
				{ name: "Players in Room", value: `\`${this.players.size}/8\``, inline: true }
			]
		);

		ws.addEventListener("error", (e) => {
			console.error("WebSocket error", playerId, e);
		});

		const initial: PlayerRecord = {
			id: playerId,
			username: this.pickUnusedPlayerTag(playerId),
			pos: { x: 0, y: 0, z: 0 },
			quat: { x: 0, y: 0, z: 0, w: 1 },
			viewYaw: 0,
			viewPitch: 0,
			kills: 0,
			botKills: 0,
			anim: "idle",
			slot: 0,
			atMenu: true,
			health: 100,
			maxHealth: 100,
			lastUpdate: Date.now(),
			lastFireAt: 0,
		};
		this.players.set(playerId, initial);

		void this.sendDiscordNotification(
			"🎮 Player Joined",
			`A new player has entered the sphere.`,
			0x44ff44,
			[
				{ name: "Player ID", value: `\`${playerId.slice(0, 8)}\``, inline: true },
				{ name: "Room", value: `\`${roomName}\``, inline: true },
				{ name: "Players in Room", value: `\`${this.players.size}/8\``, inline: true }
			]
		);

		// If this is the 2nd player, start the match timer now for PvP
		if (this.players.size === 2) {
			this.matchStartTime = Date.now();
			// Broadcast the new start time to everyone already in
			this.broadcast({
				type: "match_start",
				matchStartTime: this.matchStartTime
			});
		}

		try {
			ws.send(JSON.stringify({
				type: "init",
				playerId,
				roomId: roomName,
				players: Array.from(this.players.entries()).map(([id, p]) => [id, playerPublic(p)]),
				matchStartTime: this.matchStartTime,
				treeLayout: this.treeLayout,
				tentLayout: this.tentLayout,
				trainPhase: this.getCurrentTrainPhase(),
			}));
		} catch (err) {
			console.error("init send failed", playerId, err);
			try {
				ws.close();
			} catch {
				/* noop */
			}
			return;
		}

		ws.addEventListener("message", (msg) => {
			try {
				const raw = msg.data;
				const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
				if (text.length > MAX_JSON_BYTES) return;
				const data = JSON.parse(text) as unknown;
				this.handleMessage(playerId, data, ws);
			} catch {
				// ignore malformed
			}
		});

		ws.addEventListener("close", () => {
			const p = this.players.get(playerId);
			const username = p?.username ?? "Unknown";
			const joinTime = this.joinTimes.get(playerId) ?? Date.now();
			const durationSec = Math.floor((Date.now() - joinTime) / 1000);
			const durationStr = durationSec > 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`;

		void this.sendDiscordNotification(
			"👋 Player Left",
			`A player has exited the sphere.`,
			0xff4444,
			[
				{ name: "Username", value: `\`${username}\``, inline: true },
				{ name: "Play Time", value: `\`${durationStr}\``, inline: true },
				{ name: "Players Remaining", value: `\`${this.players.size - 1}/8\``, inline: true }
			]
		);

		this.players.delete(playerId);
			this.sessions.delete(ws);
			this.playerSockets.delete(playerId);
			this.joinTimes.delete(playerId);
			this.cleanupRateState(playerId);
			this.broadcast({
				type: "player_left",
				playerId
			});
		});
	}

	handleMessage(playerId: string, data: unknown, ws: WebSocket) {
		try {
			this.checkMatchLifecycle();
			if (!this.allowInbound(playerId)) return;
			if (Math.random() < 0.05) this.pruneStalePlayers();

			if (!data || typeof data !== "object") return;
			const d = data as Record<string, unknown>;
			const type = d.type;
			if (typeof type !== "string") return;

			switch (type) {
				case "move":
					this.handleMove(playerId, d, ws);
					break;
				case "damage":
					this.handleDamage(playerId, d);
					break;
				case "blood":
					this.handleBlood(playerId, d, ws);
					break;
				case "sound":
					this.handleSound(playerId, d, ws);
					break;
				case "respawn":
					this.handleRespawn(playerId);
					break;
				case "local_death":
					this.handleLocalSimDeath(playerId);
					break;
				default:
					return;
			}
		} catch (err) {
			console.error("handleMessage error", playerId, err);
		}
	}

	private handleMove(playerId: string, d: Record<string, unknown>, ws: WebSocket) {
		const p = this.players.get(playerId);
		if (!p) return;

		const pos = sanitizeVec3(d.pos);
		const quat = sanitizeQuat(d.quat);
		if (!pos || !quat) return;

		const uname = sanitizeUsername(d.username);
		if (uname) {
			const resolved = this.uniqueUsername(uname, playerId);
			if (resolved !== uname) {
				try {
					ws.send(JSON.stringify({ type: "username_sync", username: resolved }));
				} catch {
					/* noop */
				}
			}
			p.username = resolved;
		}

		p.pos = pos;
		p.quat = quat;
		p.viewYaw = sanitizeViewYaw(d.viewYaw);
		p.viewPitch = sanitizeViewPitch(d.viewPitch);
		p.anim = sanitizeAnim(d.anim);
		if (p.anim === "firing") {
			p.lastFireAt = Date.now();
		}
		p.slot = sanitizeSlot(d.slot);
		p.atMenu = !!d.atMenu;
		p.lastUpdate = Date.now();

		this.broadcast({
			type: "player_moved",
			playerId,
			pos: p.pos,
			quat: p.quat,
			viewYaw: p.viewYaw,
			viewPitch: p.viewPitch,
			username: p.username,
			kills: p.kills,
			botKills: p.botKills,
			anim: p.anim,
			slot: p.slot,
			atMenu: p.atMenu,
		}, ws);
	}

	private handleDamage(attackerId: string, d: Record<string, unknown>) {
		const targetId = String(d.targetId);
		if (targetId === attackerId) return;

		const attacker = this.players.get(attackerId);
		if (!attacker) return;

		// 1. Fire Window Check
		const now = Date.now();
		const timeSinceFire = now - attacker.lastFireAt;
		// Special case: Grenades/Melee might not have an "anim: firing" at the exact moment
		// but for Undersphere, shots are frequent. We allow a 1.2s window.
		if (timeSinceFire > FIRE_WINDOW_MS) {
			return; // Reject damage if attacker hasn't "fired" recently
		}

		const dmg = sanitizeDamage(d.damage);
		if (dmg <= 0) return;

		if (!this.allowDamage(attackerId)) return;

		const pairKey = `${attackerId}:${targetId}`;
		const last = this.lastDamagePairMs.get(pairKey) ?? 0;
		if (now - last < DAMAGE_COOLDOWN_MS) return;
		this.lastDamagePairMs.set(pairKey, now);

		const isBot = targetId.startsWith("bot_");
		let prevHealth = 0;
		let nextHealth = 0;
		let maxHealth = 100;
		let username = "Unknown";

		if (isBot) {
			const bot = this.bots.get(targetId);
			if (!bot) return;
			prevHealth = bot.health;
			nextHealth = Math.max(0, prevHealth - dmg);
			bot.health = nextHealth;
			maxHealth = bot.maxHealth;
			username = targetId.toUpperCase().replace("_", "-");
			// If bot was killed, we'll respawn it in a bit (client usually handles, but we track health)
			if (nextHealth <= 0 && prevHealth > 0) {
				bot.lastRespawnAt = now;
				// Auto-respawn bot health after 5s so it can be killed again authoritative-ly
				setTimeout(() => {
					bot.health = bot.maxHealth;
				}, 5000);
			}
		} else {
			const target = this.players.get(targetId);
			if (!target) return;
			
			// 2. Distance Check (PvP only)
			const distSq = Math.pow(attacker.pos.x - target.pos.x, 2) + 
			               Math.pow(attacker.pos.y - target.pos.y, 2) + 
						   Math.pow(attacker.pos.z - target.pos.z, 2);
			if (distSq > MAX_BULLET_DIST * MAX_BULLET_DIST) {
				return; // Target too far
			}

			prevHealth = target.health;
			nextHealth = Math.max(0, prevHealth - dmg);
			target.health = nextHealth;
			target.lastDamageWeapon = sanitizeWeapon(d.weapon);
			target.lastUpdate = now;
			maxHealth = target.maxHealth;
			username = target.username;
		}

		let incoming: { x: number; y: number; z: number } | undefined;
		if (d.incoming && typeof d.incoming === "object") {
			const inc = d.incoming as Record<string, unknown>;
			const v = sanitizeVec3({ x: inc.x, y: inc.y, z: inc.z });
			if (v) incoming = v;
		}

		this.broadcast({
			type: "player_damaged",
			attackerId,
			targetId,
			damage: dmg,
			health: nextHealth,
			maxHealth: maxHealth,
			...(incoming ? { incoming } : {}),
		});

		if (nextHealth <= 0 && prevHealth > 0) {
			const weapon = sanitizeWeapon(d.weapon) || "unknown";
			const victimName = username;

			if (isBot) {
				attacker.botKills += 1;
				attacker.lastUpdate = now;
				this.broadcast({
					type: "player_killed",
					attackerId,
					targetId,
					killerName: attacker.username,
					victimName,
					weapon,
					killerKills: attacker.kills,
					killerBotKills: attacker.botKills,
					...(incoming ? { deathIncoming: incoming } : {}),
				});
				// Sync updated stats
				this.broadcast({
					type: "player_stats",
					playerId: attackerId,
					kills: attacker.kills,
					botKills: attacker.botKills,
				});
			} else {
				attacker.kills += 1;
				attacker.lastUpdate = now;
				this.broadcast({
					type: "player_killed",
					attackerId,
					targetId,
					killerName: attacker.username,
					victimName,
					weapon,
					killerKills: attacker.kills,
					killerBotKills: attacker.botKills,
					...(incoming ? { deathIncoming: incoming } : {}),
				});
			}
		}
	}

	private handleBlood(_playerId: string, d: Record<string, unknown>, ws: WebSocket) {
		const point = sanitizeVec3(d.point);
		const dir = sanitizeVec3(d.dir);
		if (!point || !dir) return;
		const count = sanitizeBloodCount(d.count);
		this.broadcast({
			type: "blood_spawn",
			point,
			dir,
			count,
		}, ws);
	}

	private handleSound(_playerId: string, d: Record<string, unknown>, ws: WebSocket) {
		const sound = sanitizeSoundName(d.sound);
		if (!sound) return;
		const pos = sanitizeVec3(d.pos);
		if (!pos) return;
		const volume = sanitizeVolume(d.volume);
		this.broadcast({
			type: "sound_play",
			sound,
			pos,
			volume,
		}, ws);
	}

	/**
	 * Client-side bot damage does not go through `damage`; keep server health in sync so respawn works.
	 */
	private handleLocalSimDeath(playerId: string) {
		const me = this.players.get(playerId);
		if (!me) return;
		if (me.health <= 0) return;
		me.health = 0;
		me.lastUpdate = Date.now();
		this.players.set(playerId, me);
	}

	private handleRespawn(playerId: string) {
		const me = this.players.get(playerId);
		if (!me) return;
		if (me.health > 0) return;

		const now = Date.now();
		if (now - (me.lastRespawnAt ?? 0) < RESPAWN_COOLDOWN_MS) return;
		me.lastRespawnAt = now;

		me.health = me.maxHealth;
		const radius = 50 - 0.9;
		const phi = Math.PI - Math.random() * 0.9;
		const theta = Math.random() * Math.PI * 2;
		const x = radius * Math.sin(phi) * Math.cos(theta);
		const y = radius * Math.cos(phi);
		const z = radius * Math.sin(phi) * Math.sin(theta);
		me.pos = { x, y, z };
		me.lastUpdate = now;
		this.players.set(playerId, me);

		this.broadcast({
			type: "player_respawn",
			playerId,
			health: me.health,
			maxHealth: me.maxHealth,
			pos: me.pos
		});
	}

	private checkMatchLifecycle() {
		if (this.matchStartTime <= 0) return;
		const elapsed = Date.now() - this.matchStartTime;
		if (elapsed > MATCH_DURATION_MS + RESET_DELAY_MS) {
			this.resetMatch();
		}
	}

	private resetMatch() {
		this.matchStartTime = 0;
		for (const p of this.players.values()) {
			p.kills = 0;
			p.botKills = 0;
			p.health = 100;
			p.atMenu = true;
		}
		this.broadcast({
			type: "match_reset",
			matchStartTime: 0
		});
	}

	private pruneStalePlayers() {
		const now = Date.now();
		const timeout = 60000;
		for (const [id, p] of this.players.entries()) {
			if (now - p.lastUpdate > timeout) {
				const sock = this.playerSockets.get(id);
				if (sock) {
					try { sock.close(); } catch { /* noop */ }
					this.sessions.delete(sock);
				}
				this.players.delete(id);
				this.playerSockets.delete(id);
				this.cleanupRateState(id);
				this.broadcast({ type: "player_left", playerId: id });
			}
		}
	}

	broadcast(message: Record<string, unknown>, exclude?: WebSocket) {
		let data: string;
		try {
			data = JSON.stringify(message);
		} catch (err) {
			console.error("broadcast stringify failed", err);
			return;
		}
		for (const session of [...this.sessions]) {
			if (session === exclude) continue;
			try {
				session.send(data);
			} catch (err) {
				console.warn("broadcast send failed, closing socket", err);
				this.sessions.delete(session);
				for (const [pid, sock] of [...this.playerSockets.entries()]) {
					if (sock === session) {
						this.playerSockets.delete(pid);
						break;
					}
				}
				try {
					session.close();
				} catch {
					/* noop */
				}
			}
		}
	}

	private async sendDiscordNotification(title: string, description: string, color: number, fields: { name: string; value: string; inline?: boolean }[]) {
		const url = this.env.DISCORD_WEBHOOK_URL;
		if (!url) return;
		try {
			await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "Undersphere Logs",
					embeds: [{
						title,
						description,
						color,
						fields,
						timestamp: new Date().toISOString(),
						footer: { text: "Undersphere Match Server" }
					}],
				}),
			});
		} catch (err) {
			console.error("Discord notification failed", err);
		}
	}

	private generateTreeLayout(count: number, sphereRadius: number, safeZoneRadius: number) {
		const trees: Array<{ phi: number; theta: number; scale: number }> = [];
		const spawnPos = { x: 0, y: -sphereRadius, z: 0 };
		/** Keep in sync with client `src/core/Utils.ts` train corridor (xz great circle, phi = π/2). */
		const trainPhi = Math.PI / 2;
		const trainHalfWidth = 0.36;

		while (trees.length < count) {
			const phi = Math.random() * Math.PI;
			const theta = Math.random() * Math.PI * 2;
			if (Math.abs(phi - trainPhi) < trainHalfWidth) continue;
			const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
			const y = sphereRadius * Math.cos(phi);
			const z = sphereRadius * Math.sin(phi) * Math.sin(theta);
			const dx = x - spawnPos.x;
			const dy = y - spawnPos.y;
			const dz = z - spawnPos.z;
			const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
			if (dist < safeZoneRadius) continue;

			trees.push({
				phi,
				theta,
				scale: 1.2 + Math.random() * 2.0,
			});
		}
		return trees;
	}
}
