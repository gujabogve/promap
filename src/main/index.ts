import { app, BrowserWindow, ipcMain, dialog, protocol, net, session, screen } from 'electron';
import { join, extname, basename } from 'path';
import { readFile, writeFile, copyFile, mkdir, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
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

const MEDIA_DIR = () => join(app.getPath('userData'), 'media');

protocol.registerSchemesAsPrivileged([
	{ scheme: 'media', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow: BrowserWindow | null = null;
const externalWindows: Map<number, BrowserWindow> = new Map();
let nextProjectorId = 1;

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

		if (externalWindows.has(id)) {
			externalWindows.get(id)!.focus();
			return id;
		}

		// Find target screen
		let targetDisplay = null;
		if (screenId !== undefined) {
			targetDisplay = screen.getAllDisplays().find(d => d.id === screenId) ?? null;
		}

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
			const win = externalWindows.get(projectorId);
			if (win && !win.isDestroyed()) win.close();
			externalWindows.delete(projectorId);
		} else {
			for (const [id, win] of externalWindows) {
				if (!win.isDestroyed()) win.close();
				externalWindows.delete(id);
			}
		}
		return true;
	});

	ipcMain.handle('is-external-window-open', (_event, projectorId?: number) => {
		if (projectorId !== undefined) return externalWindows.has(projectorId);
		return externalWindows.size > 0;
	});

	ipcMain.handle('get-projector-list', () => {
		return [...externalWindows.keys()];
	});

	ipcMain.on('sync-external', (_event, data: string) => {
		for (const [, win] of externalWindows) {
			if (!win.isDestroyed()) {
				win.webContents.send('state-update', data);
			}
		}
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
