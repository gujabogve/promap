import { app, BrowserWindow, ipcMain, dialog, protocol, net, session, screen } from 'electron';
import { join, extname, basename } from 'path';
import { readFile, writeFile, copyFile, mkdir, stat, readdir, rm } from 'fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { randomUUID } from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';
import { prolinkListener } from './prolink';

// Force dedicated GPU (NVIDIA/AMD) instead of integrated
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization,UseSkiaRenderer');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('use-gl', 'angle');

const PROJECTS_DIR = () => join(app.getPath('userData'), 'projects');
const RECENT_PROJECTS_PATH = () => join(app.getPath('userData'), 'recent-projects.json');
let activeProjectDir: string | null = null;
const MEDIA_DIR = () => activeProjectDir ? join(activeProjectDir, 'media') : join(app.getPath('userData'), 'media');

protocol.registerSchemesAsPrivileged([
	{ scheme: 'media', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow: BrowserWindow | null = null;
const externalWindows: Map<number, BrowserWindow> = new Map();
const nativeProcesses: Map<number, ChildProcess> = new Map();
let nextProjectorId = 1;
let useNativeRenderer = true;
const recordingProjectors: Set<number> = new Set();

async function updateRecentProjects(name: string): Promise<void> {
	const path = RECENT_PROJECTS_PATH();
	let recent: string[] = [];
	if (existsSync(path)) {
		recent = JSON.parse(await readFile(path, 'utf-8'));
	}
	recent = [name, ...recent.filter(n => n !== name)].slice(0, 5);
	await writeFile(path, JSON.stringify(recent), 'utf-8');
}

function getNativeRendererPath(): string | null {
	const paths = [
		join(process.resourcesPath ?? '', 'native', 'promap-renderer.exe'),
		join(app.getAppPath(), 'native', 'promap-renderer', 'win-out', 'promap-renderer.exe'),
		join(app.getAppPath(), 'native', 'promap-renderer', 'target', 'release', 'promap-renderer.exe'),
	];
	return paths.find(p => existsSync(p)) ?? null;
}

function sendToNative(child: ChildProcess, msg: object): void {
	const json = Buffer.from(JSON.stringify(msg));
	const len = Buffer.alloc(4);
	len.writeUInt32LE(json.length);
	child.stdin?.write(len);
	child.stdin?.write(json);
}

function resolveMediaUrls(data: string): string {
	const mediaDir = MEDIA_DIR();
	const parsed = JSON.parse(data);
	if (parsed.resources) {
		for (const res of parsed.resources) {
			if (res.src && res.src.startsWith('media://')) {
				const filename = res.src.replace('media://', '');
				res.resolvedSrc = join(mediaDir, filename);
			}
		}
	}
	return JSON.stringify(parsed);
}

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 1024,
		minHeight: 700,
		backgroundColor: '#0a0a0a',
		icon: join(app.getAppPath(), 'build', 'icon.png'),
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
			backgroundThrottling: false,
		},
	});

	mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob: media:;"],
			},
		});
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		mainWindow.loadFile(join(app.getAppPath(), 'out', 'renderer', 'index.html'));
	}

	const closeAllExternal = (): void => {
		for (const [, win] of externalWindows) {
			if (!win.isDestroyed()) win.close();
		}
		externalWindows.clear();
	};

	mainWindow.on('closed', () => {
		mainWindow = null;
		closeAllExternal();
	});

	// Close external windows on main window reload/refresh
	let initialLoadDone = false;
	mainWindow.webContents.on('did-finish-load', () => {
		if (initialLoadDone) {
			// This is a reload — close all external windows
			closeAllExternal();
		}
		initialLoadDone = true;
	});
	mainWindow.webContents.on('render-process-gone', () => {
		closeAllExternal();
	});
}

function getWindow(): BrowserWindow | undefined {
	return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function pathToFileURL(p: string): string {
	// Convert Windows backslashes to forward slashes and ensure proper file:/// prefix
	const normalized = p.replace(/\\/g, '/');
	return `file:///${normalized.replace(/^\/+/, '')}`;
}

const MIME_TYPES: Record<string, string> = {
	'.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
	'.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
	'.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
	'.stl': 'application/octet-stream', '.svg': 'image/svg+xml',
};

function setupProtocol(): void {
	protocol.handle('media', async (request) => {
		const filename = decodeURIComponent(request.url.replace('media://', ''));
		const filePath = join(MEDIA_DIR(), filename);
		const ext = extname(filePath).toLowerCase();
		const mime = MIME_TYPES[ext] || 'application/octet-stream';

		try {
			const fileStat = await stat(filePath);
			const fileSize = fileStat.size;
			const rangeHeader = request.headers.get('range');

			if (rangeHeader) {
				const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
				if (match) {
					const start = parseInt(match[1]);
					const end = match[2] ? parseInt(match[2]) : fileSize - 1;
					const chunkSize = end - start + 1;

					const stream = createReadStream(filePath, { start, end });
					const chunks: Buffer[] = [];
					for await (const chunk of stream) {
						chunks.push(Buffer.from(chunk as Uint8Array));
					}
					const buffer = Buffer.concat(chunks);

					return new Response(buffer, {
						status: 206,
						headers: {
							'Content-Range': `bytes ${start}-${end}/${fileSize}`,
							'Accept-Ranges': 'bytes',
							'Content-Length': String(chunkSize),
							'Content-Type': mime,
						},
					});
				}
			}

			const data = await readFile(filePath);
			return new Response(data, {
				status: 200,
				headers: {
					'Content-Length': String(fileSize),
					'Content-Type': mime,
					'Accept-Ranges': 'bytes',
				},
			});
		} catch {
			return new Response('Not found', { status: 404 });
		}
	});
}

function setupIpc(): void {
	ipcMain.handle('open-external-window', async (_event, projectorId?: number, screenId?: number) => {
		const id = projectorId ?? nextProjectorId++;

		// Check if already open (native or electron)
		if (nativeProcesses.has(id) || externalWindows.has(id)) {
			if (externalWindows.has(id)) externalWindows.get(id)!.focus();
			return id;
		}

		// Find target screen
		let targetDisplay = null;
		if (screenId !== undefined) {
			targetDisplay = screen.getAllDisplays().find(d => d.id === screenId) ?? null;
		}

		const displays = screen.getAllDisplays();
		const monitorIndex = targetDisplay ? displays.indexOf(targetDisplay) : 0;

		// Try native renderer first
		const nativePath = useNativeRenderer ? getNativeRendererPath() : null;
		if (nativePath) {
			const child = spawn(nativePath, [
				'--projector-id', String(id),
				'--monitor', String(monitorIndex),
			], {
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			child.stderr?.on('data', (data: Buffer) => {
				console.log(`[native-renderer ${id}] ${data.toString().trim()}`);
			});

			child.stdout?.on('data', (data: Buffer) => {
				// Handle length-prefixed messages from native renderer
				try {
					// Simple: just log ready/error messages for now
					const str = data.toString();
					if (str.includes('"ready"')) {
						console.log(`[native-renderer ${id}] Ready`);
					}
				} catch {}
			});

			child.on('exit', (code) => {
				console.log(`[native-renderer ${id}] Exited with code ${code}`);
				nativeProcesses.delete(id);
				mainWindow?.webContents.send('external-window-closed', id);

				// Fallback to Electron window on crash
				if (code !== 0 && code !== null) {
					console.log(`[native-renderer ${id}] Crashed, falling back to Electron window`);
					useNativeRenderer = false;
					ipcMain.emit('open-external-window', _event, id, screenId);
				}
			});

			nativeProcesses.set(id, child);
			return id;
		}

		// Fallback: Electron BrowserWindow
		const bounds = targetDisplay?.bounds ?? { x: 100, y: 100, width: 1920, height: 1080 };

		const win = new BrowserWindow({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			backgroundColor: '#000000',
			frame: false,
			title: `ProMap - Projector ${id}`,
			webPreferences: {
				preload: join(__dirname, '../preload/index.js'),
				contextIsolation: true,
				nodeIntegration: false,
				backgroundThrottling: false,
			},
		});

		// Move to target display and go fullscreen after window is ready
		if (targetDisplay) {
			win.once('ready-to-show', () => {
				win.setPosition(targetDisplay!.bounds.x, targetDisplay!.bounds.y);
				win.setSize(targetDisplay!.bounds.width, targetDisplay!.bounds.height);
				setTimeout(() => {
					win.setFullScreen(true);
				}, 100);
			});
		}

		if (process.env.ELECTRON_RENDERER_URL) {
			win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/external.html?projector=${id}`);
		} else {
			const externalPath = join(app.getAppPath(), 'out', 'renderer', 'external.html');
			win.loadFile(externalPath, { query: { projector: String(id) } });
		}

		win.on('closed', () => {
			externalWindows.delete(id);
			mainWindow?.webContents.send('external-window-closed', id);
		});

		externalWindows.set(id, win);
		return id;
	});

	ipcMain.handle('close-external-window', (_event, projectorId?: number) => {
		if (projectorId !== undefined) {
			// Close native process
			const child = nativeProcesses.get(projectorId);
			if (child) {
				sendToNative(child, { type: 'shutdown' });
				setTimeout(() => child.kill(), 2000); // Force kill after 2s
				nativeProcesses.delete(projectorId);
			}
			// Close electron window
			const win = externalWindows.get(projectorId);
			if (win && !win.isDestroyed()) win.close();
			externalWindows.delete(projectorId);
		} else {
			for (const [, child] of nativeProcesses) {
				sendToNative(child, { type: 'shutdown' });
				setTimeout(() => child.kill(), 2000);
			}
			nativeProcesses.clear();
			for (const [id, win] of externalWindows) {
				if (!win.isDestroyed()) win.close();
				externalWindows.delete(id);
			}
		}
		return true;
	});

	ipcMain.handle('is-external-window-open', (_event, projectorId?: number) => {
		if (projectorId !== undefined) return externalWindows.has(projectorId) || nativeProcesses.has(projectorId);
		return externalWindows.size > 0 || nativeProcesses.size > 0;
	});

	ipcMain.handle('get-projector-list', () => {
		return [...new Set([...externalWindows.keys(), ...nativeProcesses.keys()])];
	});

	ipcMain.on('sync-external', (_event, data: string) => {
		// Send to Electron windows
		for (const [, win] of externalWindows) {
			if (!win.isDestroyed()) {
				win.webContents.send('state-update', data);
			}
		}
		// Send to native processes (with resolved media paths)
		if (nativeProcesses.size > 0) {
			const resolved = resolveMediaUrls(data);
			const parsed = JSON.parse(resolved);
			for (const [, child] of nativeProcesses) {
				sendToNative(child, { type: 'state-update', state: parsed });
			}
		}
	});

	ipcMain.handle('toggle-native-renderer', () => {
		useNativeRenderer = !useNativeRenderer;
		console.log(`Native renderer: ${useNativeRenderer ? 'enabled' : 'disabled'}`);
		return useNativeRenderer;
	});

	ipcMain.handle('is-native-renderer', () => {
		return useNativeRenderer;
	});

	// Recording
	ipcMain.handle('request-start-recording', (_event, projectorId: number) => {
		const win = externalWindows.get(projectorId);
		if (win && !win.isDestroyed()) {
			win.webContents.send('do-start-recording');
			recordingProjectors.add(projectorId);
			return true;
		}
		return false;
	});

	ipcMain.handle('request-stop-recording', (_event, projectorId: number) => {
		const win = externalWindows.get(projectorId);
		if (win && !win.isDestroyed()) {
			win.webContents.send('do-stop-recording');
			recordingProjectors.delete(projectorId);
			return true;
		}
		return false;
	});

	ipcMain.handle('is-recording', (_event, projectorId: number) => {
		return recordingProjectors.has(projectorId);
	});

	ipcMain.handle('save-video-blob', async (_event, data: Uint8Array) => {
		const win = getWindow();
		const { canceled, filePath } = await dialog.showSaveDialog(win!, {
			title: 'Save Recording',
			defaultPath: `promap-recording-${Date.now()}.webm`,
			filters: [{ name: 'WebM Video', extensions: ['webm'] }],
		});
		if (canceled || !filePath) return false;
		await writeFile(filePath, Buffer.from(data));
		return true;
	});

	// ─── Project Management ─────────────────────────────────

	ipcMain.handle('get-projects', async () => {
		const dir = PROJECTS_DIR();
		if (!existsSync(dir)) return [];
		const entries = await readdir(dir, { withFileTypes: true });
		const projects: { name: string; modifiedAt: number }[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const configPath = join(dir, entry.name, 'project.json');
			if (existsSync(configPath)) {
				const s = await stat(configPath);
				projects.push({ name: entry.name, modifiedAt: s.mtimeMs });
			}
		}
		return projects.sort((a, b) => b.modifiedAt - a.modifiedAt);
	});

	ipcMain.handle('create-project', async (_event, name: string) => {
		const dir = join(PROJECTS_DIR(), name);
		await mkdir(join(dir, 'media'), { recursive: true });
		await writeFile(join(dir, 'project.json'), '{}', 'utf-8');
		activeProjectDir = dir;
		await updateRecentProjects(name);
		return dir;
	});

	ipcMain.handle('open-project', async (_event, name: string) => {
		const dir = join(PROJECTS_DIR(), name);
		const configPath = join(dir, 'project.json');
		if (!existsSync(configPath)) return null;
		activeProjectDir = dir;
		await updateRecentProjects(name);
		const json = await readFile(configPath, 'utf-8');
		return json;
	});

	ipcMain.handle('save-project', async (_event, json: string) => {
		if (!activeProjectDir) return false;
		await writeFile(join(activeProjectDir, 'project.json'), json, 'utf-8');
		return true;
	});

	ipcMain.handle('delete-project', async (_event, name: string) => {
		const dir = join(PROJECTS_DIR(), name);
		if (existsSync(dir)) {
			await rm(dir, { recursive: true, force: true });
		}
		return true;
	});

	ipcMain.handle('get-recent-projects', async () => {
		const path = RECENT_PROJECTS_PATH();
		if (!existsSync(path)) return [];
		const json = await readFile(path, 'utf-8');
		return JSON.parse(json) as string[];
	});

	ipcMain.handle('export-project', async () => {
		if (!activeProjectDir) return false;
		const win = getWindow();
		const projectName = basename(activeProjectDir);
		const { canceled, filePath } = await dialog.showSaveDialog(win!, {
			title: 'Export Project',
			defaultPath: `${projectName}.promap`,
			filters: [{ name: 'ProMap Project', extensions: ['promap'] }],
		});
		if (canceled || !filePath) return false;

		return new Promise<boolean>((resolve) => {
			const output = createWriteStream(filePath);
			const archive = archiver('zip', { zlib: { level: 5 } });
			output.on('close', () => resolve(true));
			archive.on('error', () => resolve(false));
			archive.pipe(output);
			archive.directory(activeProjectDir!, false);
			archive.finalize();
		});
	});

	ipcMain.handle('import-project', async () => {
		const win = getWindow();
		const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
			title: 'Import Project',
			filters: [{ name: 'ProMap Project', extensions: ['promap'] }],
			properties: ['openFile'],
		});
		if (canceled || filePaths.length === 0) return null;

		const zipPath = filePaths[0];
		// Derive project name from filename
		let projectName = basename(zipPath, '.promap');
		const destDir = join(PROJECTS_DIR(), projectName);

		// If name exists, append number
		let counter = 1;
		let finalDir = destDir;
		while (existsSync(finalDir)) {
			finalDir = `${destDir} (${counter++})`;
			projectName = basename(finalDir);
		}

		await mkdir(finalDir, { recursive: true });

		await createReadStream(zipPath)
			.pipe(unzipper.Extract({ path: finalDir }))
			.promise();

		activeProjectDir = finalDir;
		await updateRecentProjects(projectName);

		const configPath = join(finalDir, 'project.json');
		if (existsSync(configPath)) {
			return await readFile(configPath, 'utf-8');
		}
		return '{}';
	});

	ipcMain.handle('get-active-project', () => {
		return activeProjectDir ? basename(activeProjectDir) : null;
	});

	ipcMain.handle('upload-media', async () => {
		const win = getWindow();
		const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
			title: 'Upload Media',
			filters: [
				{ name: 'Media Files', extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'stl'] },
			],
			properties: ['openFile', 'multiSelections'],
		});
		if (canceled || filePaths.length === 0) return [];

		const mediaDir = MEDIA_DIR();
		await mkdir(mediaDir, { recursive: true });

		const results: { name: string; type: string; filename: string }[] = [];
		for (const srcPath of filePaths) {
			const ext = extname(srcPath).toLowerCase();
			const id = randomUUID();
			const filename = `${id}${ext}`;
			const destPath = join(mediaDir, filename);
			await copyFile(srcPath, destPath);

			const isVideo = ['.mp4', '.webm', '.avi', '.mov', '.mkv'].includes(ext);
			const isStl = ext === '.stl';
			results.push({
				name: basename(srcPath),
				type: isStl ? 'stl' : isVideo ? 'video' : 'image',
				filename,
			});
		}
		return results;
	});

	// Get available screens/displays
	ipcMain.handle('get-screens', () => {
		const displays = screen.getAllDisplays();
		return displays.map(d => ({
			id: d.id,
			label: d.label || `Display ${d.id}`,
			width: d.size.width,
			height: d.size.height,
			x: d.bounds.x,
			y: d.bounds.y,
			primary: d.id === screen.getPrimaryDisplay().id,
		}));
	});

	// Pro DJ Link
	ipcMain.handle('prolink-start', () => {
		if (mainWindow) prolinkListener.start(mainWindow);
		return true;
	});
	ipcMain.handle('prolink-stop', () => {
		prolinkListener.stop();
		return true;
	});
	ipcMain.handle('prolink-devices', () => {
		return prolinkListener.getDevices();
	});
	ipcMain.handle('prolink-running', () => {
		return prolinkListener.running;
	});

	ipcMain.handle('check-for-updates', () => {
		autoUpdater.checkForUpdates().catch(() => {});
		return true;
	});

	ipcMain.handle('install-update', () => {
		autoUpdater.quitAndInstall(false, true);
		return true;
	});

	ipcMain.handle('get-app-version', () => {
		return app.getVersion();
	});

	ipcMain.handle('save-media-blob', async (_event, data: Uint8Array, filename: string) => {
		const mediaDir = MEDIA_DIR();
		await mkdir(mediaDir, { recursive: true });
		const destPath = join(mediaDir, filename);
		await writeFile(destPath, Buffer.from(data));
		return true;
	});

	ipcMain.handle('save-config', async (_event, json: string) => {
		const win = getWindow();
		const { canceled, filePath } = await dialog.showSaveDialog(win!, {
			title: 'Save Project',
			defaultPath: 'promap-project.json',
			filters: [{ name: 'ProMap Project', extensions: ['json'] }],
		});
		if (canceled || !filePath) return null;
		await writeFile(filePath, json, 'utf-8');
		return filePath;
	});

	ipcMain.handle('load-config', async () => {
		const win = getWindow();
		const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
			title: 'Load Project',
			filters: [{ name: 'ProMap Project', extensions: ['json'] }],
			properties: ['openFile'],
		});
		if (canceled || filePaths.length === 0) return null;
		const data = await readFile(filePaths[0], 'utf-8');
		return data;
	});

	ipcMain.handle('auto-save', async (_event, json: string) => {
		const autoSavePath = join(app.getPath('userData'), 'promap-autosave.json');
		await writeFile(autoSavePath, json, 'utf-8');
		return autoSavePath;
	});

	ipcMain.handle('load-auto-save', async () => {
		const autoSavePath = join(app.getPath('userData'), 'promap-autosave.json');
		try {
			return await readFile(autoSavePath, 'utf-8');
		} catch {
			return null;
		}
	});
}

function setupAutoUpdater(): void {
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;

	autoUpdater.on('update-available', (info) => {
		mainWindow?.webContents.send('update-status', { status: 'available', version: info.version });
	});

	autoUpdater.on('download-progress', (progress) => {
		mainWindow?.webContents.send('update-status', { status: 'downloading', percent: Math.round(progress.percent) });
	});

	autoUpdater.on('update-downloaded', (info) => {
		mainWindow?.webContents.send('update-status', { status: 'ready', version: info.version });
	});

	autoUpdater.on('error', () => {
		// Silent fail — don't bother user if update check fails
	});

	// Check for updates after a short delay, then every 30 minutes
	setTimeout(() => {
		autoUpdater.checkForUpdates().catch(() => {});
	}, 5000);
	setInterval(() => {
		autoUpdater.checkForUpdates().catch(() => {});
	}, 30 * 60 * 1000);
}

app.whenReady().then(() => {
	// Auto-grant media permissions (mic, camera) on Windows
	session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
		if (permission === 'media' || permission === 'microphone' || permission === 'camera') {
			callback(true);
		} else {
			callback(true);
		}
	});

	setupProtocol();
	setupIpc();
	createWindow();
	setupAutoUpdater();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
