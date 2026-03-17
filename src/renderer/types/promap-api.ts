export interface UploadedMedia {
	name: string;
	type: string;
	filename: string;
}

export interface PromapAPI {
	uploadMedia: () => Promise<UploadedMedia[]>;
	saveConfig: (json: string) => Promise<string | null>;
	loadConfig: () => Promise<string | null>;
	autoSave: (json: string) => Promise<string>;
	loadAutoSave: () => Promise<string | null>;
	openExternalWindow: (projectorId?: number) => Promise<number>;
	closeExternalWindow: (projectorId?: number) => Promise<boolean>;
	isExternalWindowOpen: (projectorId?: number) => Promise<boolean>;
	syncExternal: (data: string) => void;
	onStateUpdate: (callback: (data: string) => void) => void;
	onExternalWindowClosed: (callback: (projectorId: number) => void) => void;
}

declare global {
	interface Window {
		promap: PromapAPI;
	}
}
