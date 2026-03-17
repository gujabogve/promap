export interface UploadedMedia {
	name: string;
	type: string;
	filename: string;
}

export interface PromapAPI {
	uploadMedia: () => Promise<UploadedMedia[]>;
	saveMediaBlob: (data: Uint8Array, filename: string) => Promise<boolean>;
	saveConfig: (json: string) => Promise<string | null>;
	loadConfig: () => Promise<string | null>;
	autoSave: (json: string) => Promise<string>;
	loadAutoSave: () => Promise<string | null>;
	openExternalWindow: (projectorId?: number, screenId?: number) => Promise<number>;
	getScreens: () => Promise<ScreenInfo[]>;
	closeExternalWindow: (projectorId?: number) => Promise<boolean>;
	isExternalWindowOpen: (projectorId?: number) => Promise<boolean>;
	syncExternal: (data: string) => void;
	onStateUpdate: (callback: (data: string) => void) => void;
	onExternalWindowClosed: (callback: (projectorId: number) => void) => void;
	// Pro DJ Link
	prolinkStart: () => Promise<boolean>;
	prolinkStop: () => Promise<boolean>;
	prolinkDevices: () => Promise<CDJStatusData[]>;
	prolinkRunning: () => Promise<boolean>;
	onProlinkStatus: (callback: (status: CDJStatusData) => void) => void;
	onProlinkDeviceFound: (callback: (device: { deviceId: number; deviceName: string }) => void) => void;
	// Auto-update
	checkForUpdates: () => Promise<boolean>;
	installUpdate: () => Promise<boolean>;
	getAppVersion: () => Promise<string>;
	onUpdateStatus: (callback: (status: { status: string; version?: string; percent?: number }) => void) => void;
}

export interface ScreenInfo {
	id: number;
	label: string;
	width: number;
	height: number;
	x: number;
	y: number;
	primary: boolean;
}

export interface CDJStatusData {
	deviceId: number;
	deviceName: string;
	bpm: number;
	beat: number;
	playing: boolean;
	master: boolean;
	trackPosition: number;
	pitch: number;
}

declare global {
	interface Window {
		promap: PromapAPI;
	}
}
