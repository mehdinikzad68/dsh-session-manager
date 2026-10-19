/**
 * dsh-session-manager — Host half (Node).
 *
 * Runs inside the Host process when the Loader row mounts this package.
 * It owns the physical cleanup that the shipped UI deliberately lacks
 * (`dsh-session-persistence-jsonl` has no deletion API and the Web
 * workspace browser only archives), plus a small authenticated HTTP API
 * the browser half (lib/client.js) calls:
 *
 *     GET  /session-manager-api/inventory
 *     POST /session-manager-api/delete           { sessionIds: string[] }
 *     POST /session-manager-api/delete-workspace { workspaceId: string }
 *     POST /session-manager-api/restore          { entry: string }
 *     POST /session-manager-api/empty-trash
 *
 * The route is registered through `ctx.webServer.register` and enforces
 * the same browser trust fence as the shipped `/api` route: every request
 * is admitted through `ctx.connection.requestRejection(req)`, so only an
 * authenticated browser page (its signed cookie rides the same-origin
 * fetch) can reach it. That is the documented route-owner pattern from
 * dsh-host-webserver/dsh-client-connection.
 *
 * Deletion is deliberately conservative:
 *   - a live session (in the in-memory store or the agent registry) is
 *     never touched;
 *   - a persisted session is archived first, so the sidebar row leaves
 *     the default "Hide archived" view immediately;
 *   - the session directory is then *moved*, never `rm`'d, into
 *     `$DSH_HOME/trash/sessions/<timestamp>--<id>/` together with a
 *     manifest.json that allows the settings page to restore it.
 *
 * NOTE: like dsh-fa-rtl, this file imports only Node builtins. The
 * package lives outside the DSH runtime tree, so DSH/Cordis modules must
 * never be imported here — every service is reached through the `ctx`
 * the Loader passes to `apply`.
 */

import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const API_PREFIX = "/session-manager-api";
const MAX_BODY_BYTES = 1 << 20; // 1 MiB is far more than every call needs.
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/** Resolve the DSH data home the same way dsh-home-paths does. */
function dshHome() {
	const fromEnv = process.env.DSH_HOME;
	if (typeof fromEnv === "string" && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
	return path.join(os.homedir(), ".dsh");
}

/** One safe path segment for a session id inside the trash root. */
function safeSegment(value) {
	return String(value).replace(/[^A-Za-z0-9._-]/g, (ch) => {
		return "~" + ch.charCodeAt(0).toString(16).padStart(4, "0");
	});
}

/** Filesystem footprint of one directory: total bytes, file count, newest mtime. */
async function measure(dir) {
	let bytes = 0;
	let files = 0;
	let mtimeMs = 0;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return { bytes, files, mtimeMs };
	}
	for (const entry of entries) {
		const child = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const sub = await measure(child);
			bytes += sub.bytes;
			files += sub.files;
			if (sub.mtimeMs > mtimeMs) mtimeMs = sub.mtimeMs;
		} else if (entry.isFile()) {
			const info = await stat(child).catch(() => undefined);
			if (info !== undefined) {
				bytes += info.size;
				files += 1;
				if (info.mtimeMs > mtimeMs) mtimeMs = info.mtimeMs;
			}
		}
	}
	return { bytes, files, mtimeMs };
}

/** Canonical-ish comparison of two absolute paths (case-insensitive on Windows). */
function samePath(a, b) {
	if (a === undefined || b === undefined) return false;
	const na = path.normalize(String(a));
	const nb = path.normalize(String(b));
	return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/** Probe the cached projection hints of a session summary for a title. */
function titleFromHints(summary) {
	const values = summary?.projections?.values;
	if (values === null || typeof values !== "object") return undefined;
	for (const key of ["sessionTitle", "title", "session-title", "name"]) {
		const value = values[key];
		if (typeof value === "string" && value !== "") return value;
		if (value !== null && typeof value === "object" && typeof value.title === "string" && value.title !== "") {
			return value.title;
		}
	}
	return undefined;
}

export function apply(ctx) {
	const home = dshHome();
	const sessionsRoot = path.join(home, "sessions");
	const trashRoot = path.join(home, "trash", "sessions");

	/** Live-service lookups; every one is optional so the plugin also loads in leaner profiles. */
	const services = () => ({
		persistence: ctx.get("sessionPersistence"),
		registry: ctx.get("workspaceRegistry"),
		sessionStore: ctx.get("sessions"),
		agents: ctx.get("agents"),
		sessionController: ctx.get("sessionController"),
	});

	const isLive = (id, svc) => {
		try {
			if (svc.sessionStore !== undefined && svc.sessionStore.get(id) !== undefined) return true;
		} catch { /* defensive */ }
		try {
			if (svc.agents !== undefined && svc.agents.get(id) !== undefined) return true;
		} catch { /* defensive */ }
		return false;
	};

	/**
	 * Scan the sessions root once: every session directory, keyed by its
	 * (already injectively escaped) session id, plus the project dirs.
	 */
	const scanIndex = async () => {
		const byId = new Map();
		const projectDirs = [];
		let projects;
		try {
			projects = await readdir(sessionsRoot, { withFileTypes: true });
		} catch {
			return { byId, projectDirs, rootExists: false };
		}
		for (const project of projects) {
			if (!project.isDirectory()) continue;
			projectDirs.push(project.name);
			let entries = [];
			try {
				entries = await readdir(path.join(sessionsRoot, project.name), { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				if (entry.isDirectory()) byId.set(entry.name, { projectDir: project.name, sessionDir: entry.name });
			}
		}
		return { byId, projectDirs, rootExists: true };
	};

	/** Persistence snapshots keyed by session id (list is called at most once per operation). */
	const snapshotIndex = async (svc, problems) => {
		const byId = new Map();
		if (svc.persistence === undefined) {
			problems.push("sessionPersistence service unavailable in this profile — only filesystem facts are shown.");
			return byId;
		}
		try {
			const snapshots = await svc.persistence.list();
			for (const snapshot of snapshots) byId.set(snapshot.header.id, snapshot);
		} catch (error) {
			problems.push("sessionPersistence list failed: " + String(error?.message ?? error));
		}
		return byId;
	};

	/** Visible session summaries (title hints) from the Session Controller, best-effort. */
	const summaryIndex = async (svc) => {
		const byId = new Map();
		if (svc.sessionController === undefined || typeof svc.sessionController.list !== "function") return byId;
		try {
			const value = await svc.sessionController.list({});
			for (const summary of value?.items ?? []) byId.set(summary.sessionId, summary);
		} catch {
			try {
				const value = await svc.sessionController.list({}, undefined);
				for (const summary of value?.items ?? []) byId.set(summary.sessionId, summary);
			} catch { /* titles are optional */ }
		}
		return byId;
	};

	const trashEntries = async () => {
		const out = [];
		let names;
		try {
			names = await readdir(trashRoot, { withFileTypes: true });
		} catch {
			return out;
		}
		for (const entry of names) {
			if (!entry.isDirectory()) continue;
			const dir = path.join(trashRoot, entry.name);
			const measured = await measure(dir);
			let manifest = undefined;
			try {
				manifest = JSON.parse((await readFileUtf8(path.join(dir, "manifest.json"))) ?? "null");
			} catch { /* missing manifest is survivable */ }
			out.push({
				entry: entry.name,
				sessionId: manifest?.id,
				cwd: manifest?.cwd,
				movedAt: typeof manifest?.movedAt === "number" ? manifest.movedAt : measured.mtimeMs,
				bytes: measured.bytes,
				hasManifest: manifest !== undefined,
			});
		}
		out.sort((a, b) => b.movedAt - a.movedAt);
		return out;
	};

	async function readFileUtf8(file) {
		return readFile(file, "utf8");
	}

	/** Move one session directory into the trash, with a manifest for restore. */
	const moveToTrash = async (id, location, extras) => {
		const source = path.join(sessionsRoot, location.projectDir, location.sessionDir);
		const measured = await measure(source);
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const entryName = stamp + "--" + safeSegment(id);
		const destination = path.join(trashRoot, entryName);
		await mkdir(trashRoot, { recursive: true });
		await rename(source, destination);
		const manifest = {
			id,
			projectDir: location.projectDir,
			sessionDir: location.sessionDir,
			movedAt: Date.now(),
			bytes: measured.bytes,
			...extras,
		};
		await writeFile(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, "\t"), "utf8");
		// Drop the project directory when the last session under it is gone.
		try {
			await rmdir(path.join(sessionsRoot, location.projectDir));
		} catch { /* not empty or already gone */ }
		return { entryName, bytes: measured.bytes };
	};

	const inventory = async () => {
		const svc = services();
		const problems = [];
		if (!svc.registry) problems.push("workspaceRegistry service unavailable in this profile.");
		const [index, snapshots, summaries] = await Promise.all([
			scanIndex(),
			snapshotIndex(svc, problems),
			summaryIndex(svc),
		]);
		if (!index.rootExists) {
			problems.push("Sessions root not found: " + sessionsRoot);
		}

		const ids = new Set([...snapshots.keys(), ...index.byId.keys()]);
		const sessions = [];
		for (const id of ids) {
			const snapshot = snapshots.get(id);
			const location = index.byId.get(id);
			const cwd = snapshot?.header?.cwd;
			let measured = { bytes: 0, files: 0, mtimeMs: 0 };
			if (location !== undefined) measured = await measure(path.join(sessionsRoot, location.projectDir, location.sessionDir));
			sessions.push({
				id,
				cwd,
				title: titleFromHints(summaries.get(id)),
				persisted: snapshot !== undefined,
				onDisk: location !== undefined,
				projectDir: location?.projectDir,
				live: isLive(id, svc),
				createdAt: snapshot?.header?.createdAt,
				eventCount: snapshot?.eventCount,
				formatStatus: snapshot?.formatStatus,
				bytes: measured.bytes,
				files: measured.files,
				updatedAt: measured.mtimeMs || undefined,
				parentSessionId: snapshot?.header?.parentSession,
				origin: snapshot?.header?.origin,
			});
		}

		const workspaces = [];
		const registered = [];
		try {
			registered.push(...(svc.registry?.list() ?? []));
		} catch (error) {
			problems.push("workspaceRegistry list failed: " + String(error?.message ?? error));
		}
		const grouped = new Set();
		for (const workspace of registered) {
			const members = sessions.filter((session) => samePath(session.cwd, workspace.path));
			for (const session of members) {
				session.workspaceId = workspace.id;
				grouped.add(session.id);
			}
			workspaces.push({
				id: workspace.id,
				title: workspace.title,
				path: workspace.path,
				createdAt: workspace.createdAt,
				updatedAt: workspace.updatedAt,
				sessions: members,
				totalBytes: members.reduce((sum, session) => sum + session.bytes, 0),
				liveCount: members.filter((session) => session.live).length,
			});
		}
		const orphans = new Map();
		for (const session of sessions) {
			if (grouped.has(session.id)) continue;
			const key = session.cwd ?? "(no cwd)";
			const group = orphans.get(key) ?? { path: session.cwd, sessions: [], totalBytes: 0, liveCount: 0 };
			group.sessions.push(session);
			group.totalBytes += session.bytes;
			if (session.live) group.liveCount += 1;
			orphans.set(key, group);
		}

		const trash = await trashEntries();
		return {
			ok: true,
			home,
			sessionsRoot,
			trashRoot,
			problems,
			workspaces,
			orphans: [...orphans.values()],
			trash,
			totals: {
				sessions: sessions.length,
				bytes: sessions.reduce((sum, session) => sum + session.bytes, 0),
				trashEntries: trash.length,
				trashBytes: trash.reduce((sum, entry) => sum + entry.bytes, 0),
			},
		};
	};

	const deleteSessions = async ({ sessionIds = [] } = {}) => {
		const svc = services();
		const results = [];
		const [index, snapshots] = await Promise.all([scanIndex(), snapshotIndex(svc, [])]);
		for (const id of sessionIds) {
			try {
				if (isLive(id, svc)) {
					results.push({ id, outcome: "refused-live" });
					continue;
				}
				const location = index.byId.get(id);
				if (location === undefined) {
					results.push({ id, outcome: "missing" });
					continue;
				}
				// Archive first so the sidebar row disappears from the default
				// "Hide archived" view without waiting for a page reload.
				let archived = false;
				if (svc.registry !== undefined && snapshots.has(id)) {
					try {
						await svc.registry.archiveSession(id, {});
						archived = true;
					} catch (error) {
						results.push({ id, outcome: "refused", reason: String(error?.message ?? error) });
						continue;
					}
				}
				const snapshot = snapshots.get(id);
				const moved = await moveToTrash(id, location, {
					cwd: snapshot?.header?.cwd,
					archivedByUs: archived,
				});
				results.push({ id, outcome: "deleted", bytes: moved.bytes, entry: moved.entryName, archived });
			} catch (error) {
				results.push({ id, outcome: "error", reason: String(error?.message ?? error) });
			}
		}
		return { ok: true, results };
	};

	const deleteWorkspace = async ({ workspaceId } = {}) => {
		const svc = services();
		if (typeof workspaceId !== "string" || workspaceId === "") {
			return { ok: false, error: "workspaceId-required" };
		}
		if (svc.registry === undefined) return { ok: false, error: "registry-unavailable" };
		const workspace = svc.registry.get(workspaceId);
		if (workspace === undefined) return { ok: false, error: "workspace-unknown" };

		const [index, snapshots] = await Promise.all([scanIndex(), snapshotIndex(svc, [])]);
		const memberIds = new Set(workspace.sessionIds ?? []);
		for (const [id, snapshot] of snapshots) {
			if (samePath(snapshot.header?.cwd, workspace.path)) memberIds.add(id);
		}
		const live = [...memberIds].filter((id) => isLive(id, svc));
		if (live.length > 0) {
			return { ok: false, error: "refused-live", sessionIds: live };
		}

		await svc.registry.delete(workspaceId);
		const results = [];
		for (const id of memberIds) {
			const location = index.byId.get(id);
			if (location === undefined) {
				results.push({ id, outcome: "missing" });
				continue;
			}
			try {
				const moved = await moveToTrash(id, location, {
					cwd: workspace.path,
					workspaceId,
					archivedByUs: false,
				});
				results.push({ id, outcome: "deleted", bytes: moved.bytes, entry: moved.entryName });
			} catch (error) {
				results.push({ id, outcome: "error", reason: String(error?.message ?? error) });
			}
		}
		return { ok: true, workspaceId, results };
	};

	const restore = async ({ entry } = {}) => {
		if (typeof entry !== "string" || !/^[A-Za-z0-9._~-]+$/.test(entry)) {
			return { ok: false, error: "invalid-entry" };
		}
		const dir = path.join(trashRoot, entry);
		const manifest = JSON.parse(await readFileUtf8(path.join(dir, "manifest.json")));
		const destination = path.join(sessionsRoot, manifest.projectDir, manifest.sessionDir);
		const exists = await stat(destination).then(() => true, () => false);
		if (exists) return { ok: false, error: "target-exists", id: manifest.id };
		await mkdir(path.dirname(destination), { recursive: true });
		await rename(dir, destination);
		if (manifest.archivedByUs === true) {
			try {
				await services().registry?.unarchiveSession(manifest.id);
			} catch { /* the session is back on disk; the archive mark is harmless */ }
		}
		return { ok: true, id: manifest.id };
	};

	const emptyTrash = async () => {
		let removed = 0;
		let bytes = 0;
		let names;
		try {
			names = await readdir(trashRoot, { withFileTypes: true });
		} catch {
			return { ok: true, removed, bytes };
		}
		for (const entry of names) {
			if (!entry.isDirectory()) continue;
			const dir = path.join(trashRoot, entry.name);
			const measured = await measure(dir);
			await rm(dir, { recursive: true, force: true });
			removed += 1;
			bytes += measured.bytes;
		}
		return { ok: true, removed, bytes };
	};

	const readBody = (req) =>
		new Promise((resolve, reject) => {
			let size = 0;
			const chunks = [];
			req.on("data", (chunk) => {
				size += chunk.length;
				if (size > MAX_BODY_BYTES) {
					reject(new Error("request body too large"));
					req.destroy();
					return;
				}
				chunks.push(chunk);
			});
			req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
			req.on("error", reject);
		});

	const send = (res, status, value) => {
		const body = JSON.stringify(value);
		res.writeHead(status, JSON_HEADERS);
		res.end(body);
	};

	const handle = async (req, res) => {
		// Same admission pattern as the shipped /api route: trust fence plus
		// the authenticated browser (or API) peer. The page's signed cookie
		// rides the same-origin fetch automatically.
		const connection = ctx.get("connection");
		if (connection === undefined) {
			send(res, 503, { error: "connection-unavailable" });
			return;
		}
		if (typeof connection.requestRejection === "function") {
			const rejection = connection.requestRejection(req);
			if (rejection !== undefined) {
				send(res, rejection, { error: rejection === 401 ? "unauthorized" : "forbidden" });
				return;
			}
		}
		const url = new URL(req.url ?? "/", "http://dsh.invalid");
		const rel = url.pathname.slice(API_PREFIX.length) || "/";
		if (req.method === "GET" && rel === "/inventory") {
			send(res, 200, await inventory());
			return;
		}
		if (req.method === "POST") {
			const body = await readBody(req);
			const arg = body === "" ? {} : JSON.parse(body);
			if (rel === "/delete") {
				send(res, 200, await deleteSessions(arg));
			} else if (rel === "/delete-workspace") {
				send(res, 200, await deleteWorkspace(arg));
			} else if (rel === "/restore") {
				send(res, 200, await restore(arg));
			} else if (rel === "/empty-trash") {
				send(res, 200, await emptyTrash());
			} else {
				send(res, 404, { error: "not-found" });
			}
			return;
		}
		send(res, 404, { error: "not-found" });
	};

	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(
			() => webCtx.webServer.register({ kind: "prefix", path: API_PREFIX, handler: handle }),
			"session-manager: api route",
		);
	});

	try {
		ctx.logger?.info?.("[dsh-session-manager] host half active — trash root: " + trashRoot);
	} catch { /* best-effort */ }
}
