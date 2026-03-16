import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { join, extname, basename } from 'path';
import { readFile, writeFile, copyFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';

const MEDIA_DIR = () => join(app.getPath('userData'), 'media');

protocol.registerSchemesAsPrivileged([
	{ scheme: 'media', privileges: { stream: true, bypassCSP: true } },
]);

let mainWindow: BrowserWindow | null = null;
let externalWindow: BrowserWindow | null = null;

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
		if (externalWindow) {
			externalWindow.close();
			externalWindow = null;
		}
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
	ipcMain.handle('open-external-window', async () => {
		if (externalWindow) {
			externalWindow.focus();
			return true;
		}

		externalWindow = new BrowserWindow({
			width: 1920,
			height: 1080,
			backgroundColor: '#000000',
			frame: false,
			webPreferences: {
				preload: join(__dirname, '../preload/index.js'),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		if (process.env.ELECTRON_RENDERER_URL) {
			externalWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '/external.html');
		} else {
			externalWindow.loadFile(join(__dirname, '../renderer/external.html'));
		}

		externalWindow.on('closed', () => {
			externalWindow = null;
			mainWindow?.webContents.send('external-window-closed');
		});

		return true;
	});

	ipcMain.handle('close-external-window', () => {
		if (externalWindow) {
			externalWindow.close();
			externalWindow = null;
		}
		return true;
	});

	ipcMain.handle('is-external-window-open', () => {
		return !!externalWindow;
	});

	ipcMain.on('sync-external', (_event, data: string) => {
		if (externalWindow && !externalWindow.isDestroyed()) {
			externalWindow.webContents.send('state-update', data);
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
