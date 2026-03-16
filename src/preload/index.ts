import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('promap', {
	uploadMedia: () => ipcRenderer.invoke('upload-media'),
	saveConfig: (json: string) => ipcRenderer.invoke('save-config', json),
	loadConfig: () => ipcRenderer.invoke('load-config'),
	autoSave: (json: string) => ipcRenderer.invoke('auto-save', json),
	loadAutoSave: () => ipcRenderer.invoke('load-auto-save'),
	openExternalWindow: () => ipcRenderer.invoke('open-external-window'),
	closeExternalWindow: () => ipcRenderer.invoke('close-external-window'),
	isExternalWindowOpen: () => ipcRenderer.invoke('is-external-window-open'),
	syncExternal: (data: string) => ipcRenderer.send('sync-external', data),
	onStateUpdate: (callback: (data: string) => void) => {
		ipcRenderer.on('state-update', (_event, data) => callback(data));
	},
	onExternalWindowClosed: (callback: () => void) => {
		ipcRenderer.on('external-window-closed', () => callback());
	},
});
