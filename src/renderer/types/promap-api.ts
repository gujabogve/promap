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
	openExternalWindow: () => Promise<boolean>;
	closeExternalWindow: () => Promise<boolean>;
	isExternalWindowOpen: () => Promise<boolean>;
	syncExternal: (data: string) => void;
	onStateUpdate: (callback: (data: string) => void) => void;
	onExternalWindowClosed: (callback: () => void) => void;
}

declare global {
	interface Window {
		promap: PromapAPI;
	}
}
