import { DurableObject } from "cloudflare:workers";

export interface Env {
	GAME_ROOM: DurableObjectNamespace<GameRoom>;
}

/**
 * Worker Entry Point
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		
		// For now, everyone joins the "global" room
		const roomName = url.searchParams.get("room") || "global";
		const id = env.GAME_ROOM.idFromName(roomName);
		const room = env.GAME_ROOM.get(id);

		return room.fetch(request);
	},
};

/**
 * Durable Object: GameRoom
 * Handles player connections, state syncing, and the leaderboard.
 */
export class GameRoom extends DurableObject {
	private players = new Map<string, any>();
	private sessions = new Set<WebSocket>();
	private playerSockets = new Map<string, WebSocket>();
	private readonly matchStartTime: number;
	private readonly treeLayout: Array<{ phi: number; theta: number; scale: number }>;

	constructor(state: any, env: Env) {
		super(state, env);
		this.matchStartTime = Date.now();
		this.treeLayout = this.generateTreeLayout(80, 50, 8);
	}

	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader !== "websocket") {
			return new Response("Expected Upgrade: websocket", { status: 426 });
		}

		const [client, server] = new WebSocketPair();
		this.handleSession(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	handleSession(ws: WebSocket) {
		const playerId = crypto.randomUUID();
		this.sessions.add(ws);
		this.playerSockets.set(playerId, ws);
		ws.accept();

		this.players.set(playerId, {
			id: playerId,
			username: `Player_${Math.floor(Math.random() * 1000)}`,
			pos: { x: 0, y: 0, z: 0 },
			quat: { x: 0, y: 0, z: 0, w: 1 },
			viewYaw: 0,
			kills: 0,
			anim: "idle",
			slot: 0,
			health: 100,
			maxHealth: 100,
			lastUpdate: Date.now(),
		});

		// Send initial state
		ws.send(JSON.stringify({
			type: "init",
			playerId,
			players: Array.from(this.players.entries()),
			matchStartTime: this.matchStartTime,
			treeLayout: this.treeLayout
		}));

		ws.addEventListener("message", async (msg) => {
			try {
				const data = JSON.parse(msg.data as string);
				this.handleMessage(playerId, data, ws);
			} catch (err) {
				console.error("Failed to parse message", err);
			}
		});

		ws.addEventListener("close", () => {
			this.players.delete(playerId);
			this.sessions.delete(ws);
			this.playerSockets.delete(playerId);
			this.broadcast({
				type: "player_left",
				playerId
			});
		});
	}

	handleMessage(playerId: string, data: any, ws: WebSocket) {
		// Prune stale players every few messages to keep the room clean
		if (Math.random() < 0.05) this.pruneStalePlayers();

		switch (data.type) {
			case "move":
				// data: { pos: {x,y,z}, quat: {x,y,z,w}, kills: number, username: string }
				const existing = this.players.get(playerId) || {};
				this.players.set(playerId, {
					...existing,
					...data,
					id: playerId,
					lastUpdate: Date.now()
				});
				// Broadcast movement to others
				// Ensure type is "player_moved" and not overwritten by data.type
				this.broadcast({
					...data,
					type: "player_moved",
					playerId,
				}, ws);
				break;

			case "damage":
				// Someone hit someone else
				// data: { targetId: string, damage: number }
				if (!data?.targetId || typeof data.damage !== "number") break;
				const target = this.players.get(data.targetId);
				if (!target) break;
				const prevHealth = target.health ?? 100;
				const nextHealth = Math.max(0, prevHealth - Math.max(0, data.damage));
				target.health = nextHealth;
				target.lastDamageWeapon = data.weapon ?? "unknown";
				this.players.set(data.targetId, target);

				this.broadcast({
					type: "player_damaged",
					attackerId: playerId,
					targetId: data.targetId,
					damage: data.damage,
					health: nextHealth,
					maxHealth: target.maxHealth ?? 100
				});

				if (nextHealth <= 0 && prevHealth > 0) {
					const killer = this.players.get(playerId);
					const killerName = killer?.username ?? "Unknown";
					const weapon = target.lastDamageWeapon ?? "unknown";
					const victimName = target.username ?? "Unknown";
					this.broadcast({
						type: "player_killed",
						attackerId: playerId,
						targetId: data.targetId,
						killerName,
						victimName,
						weapon,
						deathIncoming: data.incoming,
					});
				}
				break;

			case "kill": {
				const killVictim = this.players.get(data.targetId);
				const killKiller = this.players.get(playerId);
				this.broadcast({
					type: "player_killed",
					attackerId: playerId,
					targetId: data.targetId,
					killerName: killKiller?.username ?? "Unknown",
					victimName: killVictim?.username ?? "Unknown",
					weapon: data.weapon ?? "unknown",
				});
				break;
			}

			case "blood":
				// Sync blood impacts across clients
				this.broadcast({
					type: "blood_spawn",
					point: data.point,
					dir: data.dir,
					count: data.count ?? 4,
				}, ws);
				break;

			case "sound":
				// Sync positional sound playback across clients
				this.broadcast({
					type: "sound_play",
					sound: data.sound,
					pos: data.pos,
					volume: data.volume ?? 1,
				}, ws);
				break;

			case "respawn":
				const me = this.players.get(playerId);
				if (!me) break;
				me.health = me.maxHealth ?? 100;
				// Respawn near bottom side spawn region.
				const radius = 50 - 0.9;
				const phi = Math.PI - Math.random() * 0.9;
				const theta = Math.random() * Math.PI * 2;
				const x = radius * Math.sin(phi) * Math.cos(theta);
				const y = radius * Math.cos(phi);
				const z = radius * Math.sin(phi) * Math.sin(theta);
				me.pos = { x, y, z };
				this.players.set(playerId, me);
				this.broadcast({
					type: "player_respawn",
					playerId,
					health: me.health,
					maxHealth: me.maxHealth ?? 100,
					pos: me.pos
				});
				break;
		}
	}

	private pruneStalePlayers() {
		const now = Date.now();
		const timeout = 60000; // 60 seconds of inactivity
		for (const [id, p] of this.players.entries()) {
			if (now - p.lastUpdate > timeout) {
				const ws = this.playerSockets.get(id);
				if (ws) {
					try { ws.close(); } catch {}
					this.sessions.delete(ws);
				}
				this.players.delete(id);
				this.playerSockets.delete(id);
				this.broadcast({ type: "player_left", playerId: id });
			}
		}
	}

	broadcast(message: any, exclude?: WebSocket) {
		const data = JSON.stringify(message);
		for (const session of this.sessions) {
			if (session === exclude) continue;
			try {
				session.send(data);
			} catch (err) {
				// Clean up broken sessions discovered during broadcast
				this.sessions.delete(session);
				// We don't have id here easily, but pruneStalePlayers will catch the player entry soon
			}
		}
	}

	private generateTreeLayout(count: number, sphereRadius: number, safeZoneRadius: number) {
		const trees: Array<{ phi: number; theta: number; scale: number }> = [];
		const spawnPos = { x: 0, y: -sphereRadius, z: 0 };

		while (trees.length < count) {
			const phi = Math.random() * Math.PI;
			const theta = Math.random() * Math.PI * 2;
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
