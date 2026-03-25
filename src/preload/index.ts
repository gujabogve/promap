import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('promap', {
	uploadMedia: () => ipcRenderer.invoke('upload-media'),
	saveMediaBlob: (data: Uint8Array, filename: string) => ipcRenderer.invoke('save-media-blob', data, filename),
	saveConfig: (json: string) => ipcRenderer.invoke('save-config', json),
	loadConfig: () => ipcRenderer.invoke('load-config'),
	autoSave: (json: string) => ipcRenderer.invoke('auto-save', json),
	loadAutoSave: () => ipcRenderer.invoke('load-auto-save'),
	openExternalWindow: (projectorId?: number, screenId?: number) => ipcRenderer.invoke('open-external-window', projectorId, screenId),
	getScreens: () => ipcRenderer.invoke('get-screens'),
	closeExternalWindow: (projectorId?: number) => ipcRenderer.invoke('close-external-window', projectorId),
	isExternalWindowOpen: (projectorId?: number) => ipcRenderer.invoke('is-external-window-open', projectorId),
	syncExternal: (data: string) => ipcRenderer.send('sync-external', data),
	onStateUpdate: (callback: (data: string) => void) => {
		ipcRenderer.on('state-update', (_event, data) => callback(data));
	},
	onExternalWindowClosed: (callback: (projectorId: number) => void) => {
		ipcRenderer.on('external-window-closed', (_event, id) => callback(id));
	},
	// Pro DJ Link
	prolinkStart: () => ipcRenderer.invoke('prolink-start'),
	prolinkStop: () => ipcRenderer.invoke('prolink-stop'),
	prolinkDevices: () => ipcRenderer.invoke('prolink-devices'),
	prolinkRunning: () => ipcRenderer.invoke('prolink-running'),
	onProlinkStatus: (callback: (status: unknown) => void) => {
		ipcRenderer.on('prolink-status', (_event, status) => callback(status));
	},
	onProlinkDeviceFound: (callback: (device: unknown) => void) => {
		ipcRenderer.on('prolink-device-found', (_event, device) => callback(device));
	},
	// Native renderer
	toggleNativeRenderer: () => ipcRenderer.invoke('toggle-native-renderer'),
	isNativeRenderer: () => ipcRenderer.invoke('is-native-renderer'),
	// Auto-update
	checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
	installUpdate: () => ipcRenderer.invoke('install-update'),
	getAppVersion: () => ipcRenderer.invoke('get-app-version'),
	onUpdateStatus: (callback: (status: { status: string; version?: string; percent?: number }) => void) => {
		ipcRenderer.on('update-status', (_event, status) => callback(status));
	},
});
