import { createSocket, Socket } from 'dgram';
import { BrowserWindow } from 'electron';

// Pro DJ Link protocol constants
const PROLINK_PORT = 50002; // CDJ status port
const ANNOUNCE_PORT = 50000; // Device announce port
const HEADER = Buffer.from([0x51, 0x73, 0x70, 0x74, 0x31, 0x57, 0x6d, 0x4a, 0x4f, 0x4c]); // "Qspt1WmJOL"

export interface CDJStatus {
	deviceId: number;
	deviceName: string;
	bpm: number;
	beat: number; // 1-4
	playing: boolean;
	master: boolean;
	trackPosition: number; // ms
	pitch: number; // pitch adjustment %
}

export class ProLinkListener {
	private socket: Socket | null = null;
	private announceSocket: Socket | null = null;
	private devices: Map<number, CDJStatus> = new Map();
	private mainWindow: BrowserWindow | null = null;
	private _running = false;

	get running(): boolean { return this._running; }

	start(mainWindow: BrowserWindow): void {
		if (this._running) return;
		this.mainWindow = mainWindow;

		// Listen for CDJ status packets
		this.socket = createSocket('udp4');
		this.socket.on('message', (msg) => this.handleStatus(msg));
		this.socket.on('error', (err) => console.warn('ProLink status error:', err.message));
		this.socket.bind(PROLINK_PORT, () => {
			this.socket!.setBroadcast(true);
		});

		// Listen for device announcements
		this.announceSocket = createSocket('udp4');
		this.announceSocket.on('message', (msg) => this.handleAnnounce(msg));
		this.announceSocket.on('error', (err) => console.warn('ProLink announce error:', err.message));
		this.announceSocket.bind(ANNOUNCE_PORT, () => {
			this.announceSocket!.setBroadcast(true);
		});

		this._running = true;
	}

	stop(): void {
		this._running = false;
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
		if (this.announceSocket) {
			this.announceSocket.close();
			this.announceSocket = null;
		}
		this.devices.clear();
	}

	getDevices(): CDJStatus[] {
		return [...this.devices.values()];
	}

	private handleAnnounce(msg: Buffer): void {
		// Check Pro DJ Link header
		if (msg.length < 12 || !msg.subarray(0, 10).equals(HEADER)) return;

		const packetType = msg[10];
		if (packetType !== 0x06) return; // Device announce packet

		const deviceId = msg[36] ?? 0;
		const nameBytes = msg.subarray(12, 32);
		const deviceName = nameBytes.toString('ascii').replace(/\0/g, '').trim();

		if (!this.devices.has(deviceId)) {
			this.devices.set(deviceId, {
				deviceId,
				deviceName: deviceName || `CDJ-${deviceId}`,
				bpm: 0,
				beat: 1,
				playing: false,
				master: false,
				trackPosition: 0,
				pitch: 0,
			});

			this.sendToRenderer('prolink-device-found', {
				deviceId,
				deviceName: deviceName || `CDJ-${deviceId}`,
			});
		}
	}

	private handleStatus(msg: Buffer): void {
		// Check Pro DJ Link header
		if (msg.length < 40 || !msg.subarray(0, 10).equals(HEADER)) return;

		const packetType = msg[10];

		// CDJ status update (type 0x0a)
		if (packetType === 0x0a && msg.length >= 0xd4) {
			const deviceId = msg[0x21];
			const activity = msg[0x89]; // Play state flags

			const playing = (activity & 0x40) !== 0;
			const master = (activity & 0x20) !== 0;

			// BPM is at offset 0x92, 2 bytes, divided by 100
			const bpmRaw = (msg[0x92] << 8) | msg[0x93];
			const bpm = bpmRaw / 100;

			// Pitch is at offset 0x98, 4 bytes
			const pitchRaw = (msg[0x98] << 24) | (msg[0x99] << 16) | (msg[0x9a] << 8) | msg[0x9b];
			const pitch = ((pitchRaw - 0x100000) / 0x100000) * 100;

			// Beat within bar (1-4) at offset 0xa0
			const beat = msg[0xa0] || 1;

			// Track position doesn't have a simple fixed offset in all firmware versions
			// Use beat count and BPM to estimate
			const beatCount = (msg[0xa4] << 24) | (msg[0xa5] << 16) | (msg[0xa6] << 8) | msg[0xa7];
			const trackPosition = bpm > 0 ? (beatCount / (bpm / 60)) * 1000 : 0;

			const device = this.devices.get(deviceId);
			const nameBytes = msg.subarray(0x0b, 0x20);
			const deviceName = device?.deviceName || nameBytes.toString('ascii').replace(/\0/g, '').trim() || `CDJ-${deviceId}`;

			const status: CDJStatus = {
				deviceId,
				deviceName,
				bpm: Math.round(bpm * 100) / 100,
				beat,
				playing,
				master,
				trackPosition: Math.round(trackPosition),
				pitch: Math.round(pitch * 100) / 100,
			};

			this.devices.set(deviceId, status);
			this.sendToRenderer('prolink-status', status);
		}
	}

	private sendToRenderer(channel: string, data: unknown): void {
		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.webContents.send(channel, data);
		}
	}
}

export const prolinkListener = new ProLinkListener();
