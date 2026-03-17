import { app, BrowserWindow, ipcMain, dialog, protocol, net, session } from 'electron';
import { join, extname, basename } from 'path';
import { readFile, writeFile, copyFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';

const MEDIA_DIR = () => join(app.getPath('userData'), 'media');

protocol.registerSchemesAsPrivileged([
	{ scheme: 'media', privileges: { stream: true, bypassCSP: true } },
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
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
	}

	mainWindow.on('closed', () => {
		mainWindow = null;
		for (const [, win] of externalWindows) {
			if (!win.isDestroyed()) win.close();
		}
		externalWindows.clear();
	});
}

function getWindow(): BrowserWindow | undefined {
	return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function setupProtocol(): void {
	protocol.handle('media', (request) => {
		const filename = decodeURIComponent(request.url.replace('media://', ''));
		const filePath = join(MEDIA_DIR(), filename);
		return net.fetch(`file://${filePath}`);
	});
}

function setupIpc(): void {
	ipcMain.handle('open-external-window', async (_event, projectorId?: number) => {
		const id = projectorId ?? nextProjectorId++;

		if (externalWindows.has(id)) {
			externalWindows.get(id)!.focus();
			return id;
		}

		const win = new BrowserWindow({
			width: 1920,
			height: 1080,
			backgroundColor: '#000000',
			frame: false,
			title: `ProMap - Projector ${id}`,
			webPreferences: {
				preload: join(__dirname, '../preload/index.js'),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		const url = process.env.ELECTRON_RENDERER_URL
			? `${process.env.ELECTRON_RENDERER_URL}/external.html?projector=${id}`
			: join(__dirname, '../renderer/external.html');

		if (process.env.ELECTRON_RENDERER_URL) {
			win.loadURL(url);
		} else {
			win.loadFile(url, { query: { projector: String(id) } });
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
				{ name: 'Media Files', extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
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
			results.push({
				name: basename(srcPath),
				type: isVideo ? 'video' : 'image',
				filename,
			});
		}
		return results;
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
