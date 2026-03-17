import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('promap', {
	uploadMedia: () => ipcRenderer.invoke('upload-media'),
	saveConfig: (json: string) => ipcRenderer.invoke('save-config', json),
	loadConfig: () => ipcRenderer.invoke('load-config'),
	autoSave: (json: string) => ipcRenderer.invoke('auto-save', json),
	loadAutoSave: () => ipcRenderer.invoke('load-auto-save'),
	openExternalWindow: (projectorId?: number) => ipcRenderer.invoke('open-external-window', projectorId),
	closeExternalWindow: (projectorId?: number) => ipcRenderer.invoke('close-external-window', projectorId),
	isExternalWindowOpen: (projectorId?: number) => ipcRenderer.invoke('is-external-window-open', projectorId),
	syncExternal: (data: string) => ipcRenderer.send('sync-external', data),
	onStateUpdate: (callback: (data: string) => void) => {
		ipcRenderer.on('state-update', (_event, data) => callback(data));
	},
	onExternalWindowClosed: (callback: (projectorId: number) => void) => {
		ipcRenderer.on('external-window-closed', (_event, id) => callback(id));
	},
});
