import { state } from '../state/state-manager';
import { ResourceData } from '../types';
import { TextModal } from './text-modal';
import { ColorModal } from './color-modal';
import { audioAnalyzer } from '../audio/audio-analyzer';
import { midiSync } from '../audio/midi-sync';
import { MidiTestPanel } from './midi-test-panel';
import { PixabayModal } from './pixabay-modal';
import { createShapeFromSVGFile } from '../utils/svg-parser';

export class ResourcesPanel extends HTMLElement {
	private meterRafId: number | null = null;
	private activeTab: 'resources' | 'download' | 'audio' | 'djlink' | 'cues' | 'displays' = 'resources';

	connectedCallback(): void {
		this.className = 'block bg-neutral-900 shrink-0 overflow-visible relative';
		this.activeTab = 'resources';
		this.renderPanel();
		this.setupListeners();
		this.renderList();
		state.subscribe(() => {
			if (this.activeTab === 'resources') this.renderList();
			if (this.activeTab === 'cues') { this.renderPanel(); this.setupListeners(); }
		});
		this.startMeter();

		// MIDI note listener for cues
		midiSync.onMessage((msg) => {
			if (msg.type === 'noteon' && msg.note !== undefined && msg.velocity !== undefined) {
				state.handleMidiNoteForCues(msg.note, msg.velocity);
			}
		});
		if (this.selectedAudioOutput) this.setAudioOutput(this.selectedAudioOutput);
	}

	disconnectedCallback(): void {
		if (this.meterRafId !== null) cancelAnimationFrame(this.meterRafId);
	}

	private renderPanel(): void {
		this.innerHTML = `
			<div class="flex h-full relative border-r border-neutral-700">
				<!-- Tab content -->
				<div id="tab-content" class="flex-1 flex flex-col min-w-0 overflow-hidden overflow-y-auto">
					${this.renderTabContent()}
				</div>
				<!-- Floating vertical pills — positioned outside panel, over canvas -->
				<div id="left-pills" class="absolute top-0 flex flex-col gap-0.5 z-40" style="left: 100%; margin-left: 6px;">
					${this.renderPill('resources', 'Resources', 'blue')}
					${this.renderPill('download', 'Download', 'purple')}
					${this.renderPill('audio', 'Audio', 'green')}
					${this.renderPill('djlink', 'DJ Link', 'orange')}
					${this.renderPill('cues', 'Cues', 'amber')}
					${this.renderPill('displays', 'Displays', 'cyan')}
				</div>
			</div>
		`;
	}

	private renderPill(tab: string, label: string, _color: string): string {
		const active = this.activeTab === tab;
		const colors: Record<string, string> = {
			resources: active ? 'text-blue-400 bg-neutral-800 border-l-2 border-blue-500' : '',
			download: active ? 'text-purple-400 bg-neutral-800 border-l-2 border-purple-500' : '',
			audio: active ? 'text-green-400 bg-neutral-800 border-l-2 border-green-500' : '',
			djlink: active ? 'text-orange-400 bg-neutral-800 border-l-2 border-orange-500' : '',
			cues: active ? 'text-amber-400 bg-neutral-800 border-l-2 border-amber-500' : '',
			displays: active ? 'text-cyan-400 bg-neutral-800 border-l-2 border-cyan-500' : '',
		};
		const cls = colors[tab] || (active ? '' : 'text-neutral-500 bg-neutral-900/80 hover:text-neutral-300 hover:bg-neutral-800');
		const inactive = active ? '' : 'text-neutral-500 bg-neutral-900/80 hover:text-neutral-300 hover:bg-neutral-800';
		return `<button data-left-tab="${tab}" class="px-1 py-2 text-xs font-semibold rounded-r ${active ? cls : inactive}" style="writing-mode: vertical-lr; backdrop-filter: blur(4px);">${label}</button>`;
	}

	private renderTabContent(): string {
		switch (this.activeTab) {
			case 'resources': return this.renderResourcesTab();
			case 'download': return this.renderDownloadTab();
			case 'audio': return this.renderAudioTab();
			case 'djlink': return this.renderDJLinkTab();
			case 'cues': return this.renderCuesTab();
			case 'displays': return this.renderDisplaysTab();
		}
	}

	private renderResourcesTab(): string {
		return `
			<div class="p-3 border-b border-neutral-700">
				<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Resources</h2>
				<div class="flex gap-1.5 mb-1.5">
					<button id="btn-add-media" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Media</button>
					<button id="btn-add-text" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Text</button>
					<button id="btn-add-color" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Color</button>
				</div>
				<div class="flex gap-1.5">
					<button id="btn-add-svg-shape" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ SVG Shape</button>
					<button id="btn-add-stl" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ 3D Model</button>
				</div>
			</div>
			<div id="resources-list" class="flex-1 overflow-y-auto p-3">
				<div class="text-xs text-neutral-500 text-center py-8">No resources</div>
			</div>
			<div id="shape-templates-section" class="border-t border-neutral-700 p-3">
				<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Saved Shapes</h2>
				<div id="shape-templates-list"></div>
			</div>
		`;
	}

	private renderDownloadTab(): string {
		return `
			<div class="p-3 border-b border-neutral-700">
				<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Download</h2>
				<button id="btn-download" class="w-full px-2 py-1.5 text-xs bg-purple-900 hover:bg-purple-800 rounded border border-purple-700 text-purple-200">↓ Search Pixabay</button>
			</div>
			<div id="downloaded-section" class="flex-1 overflow-y-auto">
				<div class="px-3 py-2 text-xs text-neutral-400 font-semibold uppercase tracking-wide border-b border-neutral-700">Cached</div>
				<div id="downloaded-list" class="px-3 py-2"></div>
			</div>
		`;
	}

	private renderAudioTab(): string {
		return `
			<div class="flex-1 overflow-y-auto p-3 space-y-3">
				<div>
					<label class="text-xs text-neutral-400 uppercase tracking-wide font-semibold block mb-1">Audio Output</label>
					<select id="audio-output" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						<option value="">Default</option>
					</select>
				</div>
				<div class="border-t border-neutral-700 pt-3">
					<div class="flex items-center justify-between mb-2">
						<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Mic</h2>
						<div class="flex items-center gap-2">
							<span id="meter-db" class="text-xs text-neutral-500 font-mono w-12 text-right">-∞ dB</span>
							<button id="btn-mic-toggle" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Mic</button>
						</div>
					</div>
					<div class="mb-1.5">
						<select id="audio-source" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							<option value="">Default</option>
						</select>
					</div>
					<div class="relative h-3 bg-neutral-800 rounded overflow-hidden mb-1.5">
						<div id="meter-bar" class="h-full bg-green-500 transition-none rounded" style="width: 0%;"></div>
						<div id="meter-threshold-marker" class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style="left: ${Math.round(audioAnalyzer.threshold * 100)}%;"></div>
					</div>
					<div class="flex items-center gap-1.5 mb-1">
						<span class="text-xs text-neutral-500 w-14">Threshold</span>
						<input id="meter-threshold" type="range" min="1" max="50" value="${Math.round(audioAnalyzer.threshold * 100)}" class="flex-1 accent-red-500">
						<span id="meter-threshold-value" class="text-xs text-neutral-500 font-mono w-8 text-right">${Math.round(audioAnalyzer.threshold * 100)}%</span>
					</div>
					<div class="flex items-center gap-1.5 mb-1.5">
						<span class="text-xs text-neutral-500 w-14">Beat sens.</span>
						<input id="meter-beat-sens" type="range" min="10" max="50" value="${Math.round(audioAnalyzer.beatSensitivity * 10)}" class="flex-1 accent-yellow-500">
						<span id="meter-beat-sens-value" class="text-xs text-neutral-500 font-mono w-8 text-right">${audioAnalyzer.beatSensitivity.toFixed(1)}x</span>
					</div>
					<div class="flex gap-px h-10" id="meter-freq-bars">
						${Array.from({ length: 32 }, (_, i) => `<div class="flex-1 bg-neutral-800 rounded-t flex flex-col justify-end"><div id="freq-bar-${i}" class="bg-green-500 rounded-t" style="height: 0%;"></div></div>`).join('')}
					</div>
					<div class="flex items-center justify-between mt-1.5">
						<div class="flex items-center gap-1.5">
							<span class="text-xs text-neutral-500">Level</span>
							<span id="meter-active-dot" class="w-2 h-2 rounded-full bg-neutral-700"></span>
							<span id="meter-beat-dot" class="w-2 h-2 rounded-full bg-neutral-700" title="Beat"></span>
							<span id="meter-bpm" class="text-xs text-neutral-600 font-mono"></span>
						</div>
						<span id="meter-peak" class="text-xs text-neutral-500 font-mono">0%</span>
					</div>
				</div>

				<div class="border-t border-neutral-700 pt-3">
					<div class="flex items-center justify-between mb-1.5">
						<span class="text-xs text-neutral-400 uppercase tracking-wide font-semibold">MIDI</span>
						<div class="flex items-center gap-1.5">
							<span id="midi-bpm-display" class="text-xs text-neutral-500 font-mono">-- BPM</span>
							<button id="btn-midi-test" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Test</button>
						</div>
					</div>
					<div class="mb-1.5">
						<div class="flex gap-1">
							<select id="midi-device" class="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
								<option value="">No MIDI device</option>
							</select>
							<button id="btn-midi-connect" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Connect</button>
						</div>
					</div>
					<div class="flex items-center gap-2 mb-1.5">
						<div class="flex gap-1">
							<div id="midi-beat-0" class="w-3 h-3 rounded-full bg-neutral-700"></div>
							<div id="midi-beat-1" class="w-3 h-3 rounded-full bg-neutral-700"></div>
							<div id="midi-beat-2" class="w-3 h-3 rounded-full bg-neutral-700"></div>
							<div id="midi-beat-3" class="w-3 h-3 rounded-full bg-neutral-700"></div>
						</div>
						<div id="midi-beat-flash" class="flex-1 h-3 bg-neutral-800 rounded overflow-hidden">
							<div id="midi-beat-bar" class="h-full bg-blue-500 rounded" style="width: 0%; transition: width 50ms;"></div>
						</div>
					</div>
					<div class="flex gap-px h-6" id="midi-note-bars">
						${Array.from({ length: 16 }, (_, i) => `<div class="flex-1 bg-neutral-800 rounded-t flex flex-col justify-end"><div id="midi-note-bar-${i}" class="bg-purple-500 rounded-t" style="height: 0%; transition: height 100ms;"></div></div>`).join('')}
					</div>
					<div class="flex items-center justify-between mt-1">
						<span class="text-xs text-neutral-600">Notes</span>
						<span id="midi-last-msg" class="text-xs text-neutral-600 font-mono truncate ml-2"></span>
					</div>
				</div>
			</div>
		`;
	}

	private renderCuesTab(): string {
		const cues = state.getCues();
		const activeCueId = state.activeCueId;
		const learningId = state.midiLearnCueId;

		const formatTime = (ms: number): string => {
			const totalSec = Math.floor(ms / 1000);
			const min = Math.floor(totalSec / 60);
			const sec = totalSec % 60;
			return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		};

		const noteToName = (note: number): string => {
			const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
			return names[note % 12] + (Math.floor(note / 12) - 1);
		};

		let cuesHtml = '';
		if (cues.length === 0) {
			cuesHtml = '<div class="text-xs text-neutral-500 text-center py-4">No cues configured</div>';
		} else {
			cuesHtml = cues.map(cue => {
				const isActive = activeCueId === cue.id;
				const isLearning = learningId === cue.id;
				const noteBadge = isLearning
					? '<span class="animate-pulse text-amber-400">...</span>'
					: cue.midiNote !== null
						? noteToName(cue.midiNote)
						: '?';
				const badgeClass = isLearning
					? 'bg-amber-700/50 border-amber-600 text-amber-300'
					: cue.midiNote !== null
						? 'bg-neutral-700 border-neutral-600 text-neutral-200'
						: 'bg-neutral-800 border-neutral-600 text-neutral-500 cursor-pointer';

				return `
					<div class="mb-2 p-2 rounded border ${isActive ? 'bg-green-900/20 border-green-700/50' : 'bg-neutral-850 border-neutral-700'}">
						<div class="flex items-center gap-2 mb-1.5">
							<button data-cue-learn="${cue.id}" class="w-8 h-6 flex items-center justify-center text-xs rounded border font-mono ${badgeClass}" title="${isLearning ? 'Listening for MIDI...' : cue.midiNote !== null ? 'Click to reassign' : 'Click to learn MIDI key'}">${noteBadge}</button>
							<input data-cue-name="${cue.id}" type="text" value="${cue.name}" class="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-200">
							<button data-cue-delete="${cue.id}" class="text-xs text-red-400 hover:text-red-300" title="Delete">✕</button>
						</div>
						<div class="flex items-center gap-1.5">
							<span class="text-xs text-neutral-400 font-mono">${formatTime(cue.startTime)}</span>
							<span class="text-xs text-neutral-500">→</span>
							<span class="text-xs text-neutral-400 font-mono">${formatTime(cue.endTime)}</span>
							<div class="flex-1"></div>
							<button data-cue-start="${cue.id}" class="w-5 h-5 flex items-center justify-center text-xs bg-neutral-700 hover:bg-neutral-600 rounded border border-neutral-600 text-neutral-300" title="Set start to current time">S</button>
							<button data-cue-end="${cue.id}" class="w-5 h-5 flex items-center justify-center text-xs bg-neutral-700 hover:bg-neutral-600 rounded border border-neutral-600 text-neutral-300" title="Set end to current time">E</button>
							${isActive ? '<button data-cue-stop class="px-1.5 h-5 flex items-center justify-center text-xs bg-red-800 hover:bg-red-700 rounded border border-red-700 text-red-200" title="Stop">■</button>' : ''}
						</div>
					</div>
				`;
			}).join('');
		}

		return `
			<div class="flex-1 overflow-y-auto p-3">
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Cues</h2>
					<button id="btn-add-cue" class="px-2 py-0.5 text-xs bg-amber-800 hover:bg-amber-700 rounded border border-amber-700 text-amber-200">+ Add</button>
				</div>
				${cuesHtml}
			</div>
		`;
	}

	private renderDisplaysTab(): string {
		const projectorIds = state.getProjectorIds();
		const shapes = state.getShapes();

		let projectorsHtml = '';
		if (projectorIds.length === 0) {
			projectorsHtml = '<div class="text-xs text-neutral-500 text-center py-4">No projectors configured</div>';
		} else {
			projectorsHtml = projectorIds.map(id => {
				const isOpen = state.openProjectors.has(id);
				const opts = state.projectorDisplayOptions.get(id) ?? { showOutline: false, showPoints: false, showGrid: false, showFace: false };
				const assigned = shapes.filter(s => s.projector === id);
				const config = state.projectorConfigs.get(id);
				return `
					<div class="mb-3 p-2 ${isOpen ? 'bg-neutral-800 border-cyan-700/50' : 'bg-neutral-850 border-neutral-700'} rounded border proj-drop-zone" data-proj-drop="${id}">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-1.5">
								<button data-toggle-projector="${id}" class="w-5 h-5 flex items-center justify-center text-xs rounded ${isOpen ? 'bg-green-700 text-green-100' : 'bg-neutral-700 text-neutral-400'}" title="${isOpen ? 'Hide' : 'Show'}">${isOpen ? '●' : '○'}</button>
								<span class="text-xs font-semibold text-neutral-200">P${id}</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-xs text-neutral-500">${assigned.length}</span>
								<button data-remove-projector="${id}" class="text-xs text-red-400 hover:text-red-300" title="Remove">✕</button>
							</div>
						</div>
						<!-- Screen selector -->
						<div class="mb-2">
							<select data-proj-screen="${id}" class="w-full px-2 py-1 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-300">
								<option value="">Windowed</option>
								<option value="loading">Loading screens...</option>
							</select>
						</div>
						<div class="space-y-1 mb-2">
							<label class="text-xs text-neutral-300 flex items-center gap-1.5"><input type="checkbox" data-proj-opt="${id}-showOutline" ${opts.showOutline ? 'checked' : ''} class="accent-cyan-500"> Outline</label>
							<label class="text-xs text-neutral-300 flex items-center gap-1.5"><input type="checkbox" data-proj-opt="${id}-showPoints" ${opts.showPoints ? 'checked' : ''} class="accent-cyan-500"> Points</label>
							<label class="text-xs text-neutral-300 flex items-center gap-1.5"><input type="checkbox" data-proj-opt="${id}-showGrid" ${opts.showGrid ? 'checked' : ''} class="accent-cyan-500"> Grid</label>
							<label class="text-xs text-neutral-300 flex items-center gap-1.5"><input type="checkbox" data-proj-opt="${id}-showFace" ${opts.showFace ? 'checked' : ''} class="accent-cyan-500"> Face</label>
						</div>
						<div class="space-y-0.5 max-h-24 overflow-y-auto min-h-6">
							${assigned.length > 0 ? assigned.map(s => `
								<div class="flex items-center gap-1 text-xs text-neutral-400 cursor-grab px-1 py-0.5 rounded hover:bg-neutral-700" draggable="true" data-drag-shape-proj="${s.id}">
									<span>${s.type === 'circle' ? '●' : s.type === 'triangle' ? '▲' : s.type === 'square' ? '■' : '⬡'}</span>
									<span class="truncate flex-1">${s.name}</span>
									<span class="text-neutral-600 text-xs">⋮</span>
								</div>
							`).join('') : '<div class="text-xs text-neutral-600 text-center py-1">Drop shapes here</div>'}
						</div>
					</div>
				`;
			}).join('');
		}

		// Unassigned shapes (not matching any configured projector)
		const unassigned = shapes.filter(s => !projectorIds.includes(s.projector));
		const unassignedHtml = unassigned.length > 0 ? `
			<div class="mb-3 p-2 bg-neutral-900 rounded border border-dashed border-neutral-600">
				<div class="text-xs text-neutral-500 mb-1">Unassigned (${unassigned.length})</div>
				<div class="space-y-0.5 max-h-24 overflow-y-auto">
					${unassigned.map(s => `
						<div class="flex items-center gap-1 text-xs text-neutral-400 cursor-grab px-1 py-0.5 rounded hover:bg-neutral-800" draggable="true" data-drag-shape-proj="${s.id}">
							<span>${s.type === 'circle' ? '●' : s.type === 'triangle' ? '▲' : s.type === 'square' ? '■' : '⬡'}</span>
							<span class="truncate flex-1">${s.name}</span>
							<span class="text-neutral-600">P${s.projector}</span>
						</div>
					`).join('')}
				</div>
			</div>
		` : '';

		return `
			<div class="flex-1 overflow-y-auto p-3">
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Displays</h2>
					<div class="flex items-center gap-2">
						<label id="native-renderer-toggle" class="flex items-center gap-1 cursor-pointer" title="Use native GPU renderer (better video performance)">
							<span class="text-xs text-neutral-500">Native</span>
							<div class="relative">
								<input type="checkbox" id="chk-native-renderer" class="sr-only peer">
								<div class="w-7 h-4 bg-neutral-700 rounded-full peer-checked:bg-cyan-700 transition-colors"></div>
								<div class="absolute left-0.5 top-0.5 w-3 h-3 bg-neutral-400 rounded-full peer-checked:translate-x-3 peer-checked:bg-cyan-200 transition-all"></div>
							</div>
						</label>
						<button id="btn-add-projector" class="px-2 py-0.5 text-xs bg-cyan-800 hover:bg-cyan-700 rounded border border-cyan-700 text-cyan-200">+ Add</button>
					</div>
				</div>
				${unassignedHtml}
				${projectorsHtml}
			</div>
		`;
	}

	private renderDJLinkTab(): string {
		return `
			<div class="flex-1 overflow-y-auto p-3">
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Pro DJ Link</h2>
					<button id="btn-prolink-toggle" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Connect</button>
				</div>
				<p class="text-xs text-neutral-600 mb-3">Connect to CDJ-3000, CDJ-2000NXS2, XDJ, Rekordbox on the same network.</p>
				<div id="prolink-devices" class="space-y-1">
					<div class="text-xs text-neutral-600 text-center py-4">Not connected</div>
				</div>
			</div>
		`;
	}

	private setupListeners(): void {
		// Tab switching
		this.querySelectorAll<HTMLElement>('[data-left-tab]').forEach(btn => {
			btn.addEventListener('click', () => {
				this.activeTab = btn.dataset.leftTab as typeof this.activeTab;
				this.renderPanel();
				this.setupListeners();
				if (this.activeTab === 'resources') this.renderList();
				if (this.activeTab === 'download') this.renderDownloadedList();
				if (this.activeTab === 'audio') this.startMeter();
			});
		});

		// Tab-specific listeners
		if (this.activeTab === 'resources') {
			this.querySelector('#btn-add-media')?.addEventListener('click', () => this.addMedia());
			this.querySelector('#btn-add-text')?.addEventListener('click', () => this.addText());
			this.querySelector('#btn-add-color')?.addEventListener('click', () => this.addColor());
			this.querySelector('#btn-add-svg-shape')?.addEventListener('click', () => {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.svg';
				input.multiple = true;
				input.addEventListener('change', async () => {
					if (!input.files) return;
					let failed = 0;
					for (const file of input.files) {
						const ok = await createShapeFromSVGFile(file);
						if (!ok) failed++;
					}
					if (failed > 0) alert(`${failed} SVG file(s) could not be parsed.`);
				});
				input.click();
			});
			this.querySelector('#btn-add-stl')?.addEventListener('click', () => {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.stl';
				input.multiple = true;
				input.addEventListener('change', async () => {
					if (!input.files) return;
					for (const file of input.files) {
						const buffer = await file.arrayBuffer();
						const filename = crypto.randomUUID() + '.stl';
						await window.promap.saveMediaBlob(new Uint8Array(buffer), filename);
						state.addResource({
							name: file.name,
							type: 'stl',
							src: `media://${filename}`,
							stlOptions: { rotationSpeed: 1 },
						});
					}
				});
				input.click();
			});
		}

		if (this.activeTab === 'download') {
			this.querySelector('#btn-download')?.addEventListener('click', () => {
				(document.querySelector('pixabay-modal') as PixabayModal)?.show();
			});
			this.renderDownloadedList();
		}

		if (this.activeTab === 'cues') {
			this.querySelector('#btn-add-cue')?.addEventListener('click', () => {
				state.addCue();
				this.renderPanel();
				this.setupListeners();
			});

			this.querySelectorAll<HTMLElement>('[data-cue-learn]').forEach(btn => {
				btn.addEventListener('click', () => {
					const id = btn.dataset.cueLearn!;
					if (state.midiLearnCueId === id) {
						state.cancelMidiLearn();
					} else {
						state.startMidiLearn(id);
					}
					this.renderPanel();
					this.setupListeners();
				});
			});

			this.querySelectorAll<HTMLElement>('[data-cue-delete]').forEach(btn => {
				btn.addEventListener('click', () => {
					state.removeCue(btn.dataset.cueDelete!);
					this.renderPanel();
					this.setupListeners();
				});
			});

			this.querySelectorAll<HTMLInputElement>('[data-cue-name]').forEach(input => {
				input.addEventListener('change', () => {
					state.updateCue(input.dataset.cueName!, { name: input.value });
				});
			});

			this.querySelectorAll<HTMLElement>('[data-cue-start]').forEach(btn => {
				btn.addEventListener('click', () => {
					state.updateCue(btn.dataset.cueStart!, { startTime: state.timelineTime });
					this.renderPanel();
					this.setupListeners();
				});
			});

			this.querySelectorAll<HTMLElement>('[data-cue-end]').forEach(btn => {
				btn.addEventListener('click', () => {
					state.updateCue(btn.dataset.cueEnd!, { endTime: state.timelineTime });
					this.renderPanel();
					this.setupListeners();
				});
			});

			this.querySelector('[data-cue-stop]')?.addEventListener('click', () => {
				state.stopCue();
				this.renderPanel();
				this.setupListeners();
			});
		}

		if (this.activeTab === 'displays') {
			// Native renderer toggle
			const nativeChk = this.querySelector<HTMLInputElement>('#chk-native-renderer');
			if (nativeChk) {
				window.promap.isNativeRenderer().then(v => { nativeChk.checked = v; });
				nativeChk.addEventListener('change', async () => {
					const enabled = await window.promap.toggleNativeRenderer();
					nativeChk.checked = enabled;
				});
			}

			// Add projector (config only, no window)
			this.querySelector('#btn-add-projector')?.addEventListener('click', () => {
				state.addProjector();
				this.renderPanel();
				this.setupListeners();
			});

			// Show/hide toggle
			this.querySelectorAll<HTMLElement>('[data-toggle-projector]').forEach(btn => {
				btn.addEventListener('click', async () => {
					const id = parseInt(btn.dataset.toggleProjector!);
					await state.toggleExternalWindow(id);
					this.renderPanel();
					this.setupListeners();
				});
			});

			// Remove projector
			this.querySelectorAll<HTMLElement>('[data-remove-projector]').forEach(btn => {
				btn.addEventListener('click', () => {
					state.removeProjector(parseInt(btn.dataset.removeProjector!));
					this.renderPanel();
					this.setupListeners();
				});
			});

			// Screen selector — populate with actual screens
			this.populateScreenSelectors();

			this.querySelectorAll<HTMLSelectElement>('[data-proj-screen]').forEach(sel => {
				sel.addEventListener('change', () => {
					const projId = parseInt(sel.dataset.projScreen!);
					const screenId = sel.value ? parseInt(sel.value) : null;
					state.setProjectorScreen(projId, screenId);
				});
			});

			this.querySelectorAll<HTMLInputElement>('[data-proj-opt]').forEach(el => {
				el.addEventListener('change', () => {
					const parts = el.dataset.projOpt!.split('-');
					const id = parseInt(parts[0]);
					const key = parts.slice(1).join('-');
					const opts = state.projectorDisplayOptions.get(id) ?? { showOutline: false, showPoints: false, showGrid: false, showFace: false };
					(opts as Record<string, boolean>)[key] = el.checked;
					state.projectorDisplayOptions.set(id, opts);
					state.syncExternal();
				});
			});

			// Drag shapes between projectors
			this.querySelectorAll<HTMLElement>('[data-drag-shape-proj]').forEach(el => {
				el.addEventListener('dragstart', (e) => {
					e.dataTransfer?.setData('text/plain', el.dataset.dragShapeProj!);
				});
			});

			this.querySelectorAll<HTMLElement>('[data-proj-drop]').forEach(zone => {
				zone.addEventListener('dragover', (e) => {
					e.preventDefault();
					zone.classList.add('border-cyan-500');
				});
				zone.addEventListener('dragleave', () => {
					zone.classList.remove('border-cyan-500');
				});
				zone.addEventListener('drop', (e) => {
					e.preventDefault();
					zone.classList.remove('border-cyan-500');
					const shapeId = e.dataTransfer?.getData('text/plain');
					const projId = parseInt(zone.dataset.projDrop!);
					if (shapeId && !isNaN(projId)) {
						state.updateShape(shapeId, { projector: projId });
						this.renderPanel();
						this.setupListeners();
					}
				});
			});
		}


		// MIDI test player
		this.querySelector('#btn-midi-test')?.addEventListener('click', () => {
			const panel = document.querySelector('midi-test-panel') as MidiTestPanel | null;
			if (panel) panel.show();
		});

		// MIDI device connect
		const midiConnectBtn = this.querySelector('#btn-midi-connect') as HTMLElement;
		const midiDeviceSelect = this.querySelector('#midi-device') as HTMLSelectElement;

		midiConnectBtn?.addEventListener('click', async () => {
			if (midiSync.connected) {
				midiSync.disconnect();
				midiConnectBtn.textContent = 'Connect';
				midiConnectBtn.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				midiConnectBtn.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				if (midiDeviceSelect) midiDeviceSelect.innerHTML = '<option value="">No MIDI device</option>';
			} else {
				const ok = await midiSync.init();
				if (ok) {
					midiConnectBtn.textContent = 'Disconnect';
					midiConnectBtn.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
					midiConnectBtn.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
					this.populateMidiDevices();
				}
			}
		});

		midiDeviceSelect?.addEventListener('change', () => {
			midiSync.selectDevice(midiDeviceSelect.value || null);
		});

		// Pro DJ Link
		const prolinkBtn = this.querySelector('#btn-prolink-toggle') as HTMLElement;
		prolinkBtn?.addEventListener('click', async () => {
			const running = await window.promap.prolinkRunning();
			if (running) {
				await window.promap.prolinkStop();
				prolinkBtn.textContent = 'Connect';
				prolinkBtn.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				prolinkBtn.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				const devList = this.querySelector('#prolink-devices');
				if (devList) devList.innerHTML = '<div class="text-xs text-neutral-600 text-center py-1">Not connected</div>';
			} else {
				await window.promap.prolinkStart();
				prolinkBtn.textContent = 'Disconnect';
				prolinkBtn.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				prolinkBtn.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
				const devList = this.querySelector('#prolink-devices');
				if (devList) devList.innerHTML = '<div class="text-xs text-neutral-500 text-center py-1">Scanning network...</div>';
			}
		});

		window.promap.onProlinkStatus((status) => {
			const s = status as { deviceId: number; deviceName: string; bpm: number; beat: number; playing: boolean; master: boolean };
			this.updateProlinkDevice(s);
		});

		window.promap.onProlinkDeviceFound((device) => {
			const d = device as { deviceId: number; deviceName: string };
			const devList = this.querySelector('#prolink-devices');
			if (devList && devList.querySelector('.text-center')) {
				devList.innerHTML = '';
			}
		});

		// Audio source selector
		const audioSourceSelect = this.querySelector('#audio-source') as HTMLSelectElement;
		audioSourceSelect?.addEventListener('change', () => {
			state.audioSourceId = audioSourceSelect.value || null;
		});
		this.enumerateAudioDevices();

		const audioOutputSelect = this.querySelector('#audio-output') as HTMLSelectElement;
		audioOutputSelect?.addEventListener('change', () => {
			this.setAudioOutput(audioOutputSelect.value || '');
		});
		this.enumerateAudioOutputDevices();

		// Threshold slider
		const thresholdSlider = this.querySelector('#meter-threshold') as HTMLInputElement;
		thresholdSlider?.addEventListener('input', () => {
			const val = parseInt(thresholdSlider.value);
			audioAnalyzer.threshold = val / 100;
			const label = this.querySelector('#meter-threshold-value');
			if (label) label.textContent = `${val}%`;
			const marker = this.querySelector('#meter-threshold-marker') as HTMLElement;
			if (marker) marker.style.left = `${val}%`;
		});

		// Beat sensitivity slider
		const beatSensSlider = this.querySelector('#meter-beat-sens') as HTMLInputElement;
		beatSensSlider?.addEventListener('input', () => {
			const val = parseInt(beatSensSlider.value) / 10;
			audioAnalyzer.beatSensitivity = val;
			const label = this.querySelector('#meter-beat-sens-value');
			if (label) label.textContent = `${val.toFixed(1)}x`;
		});

		const micBtn = this.querySelector('#btn-mic-toggle') as HTMLElement;
		micBtn?.addEventListener('click', async () => {
			if (audioAnalyzer.running) {
				await audioAnalyzer.stop();
				micBtn.textContent = 'Mic';
				micBtn.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				micBtn.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
			} else {
				await audioAnalyzer.start(state.audioSourceId ?? undefined);
				micBtn.textContent = 'Mic On';
				micBtn.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				micBtn.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
				this.enumerateAudioDevices();
			}
		});
	}

	private midiBeatCount = 0;
	private noteDecay: number[] = new Array(16).fill(0);

	private setupMidiVisuals(): void {
		midiSync.onBeat(() => {
			this.midiBeatCount++;

			// Beat dots
			const dotIndex = (this.midiBeatCount - 1) % 4;
			for (let i = 0; i < 4; i++) {
				const dot = this.querySelector(`#midi-beat-${i}`) as HTMLElement;
				if (dot) dot.className = `w-3 h-3 rounded-full ${i === dotIndex ? 'bg-blue-400' : 'bg-neutral-700'}`;
			}

			// Beat flash bar
			const beatBar = this.querySelector('#midi-beat-bar') as HTMLElement;
			if (beatBar) {
				beatBar.style.width = '100%';
				setTimeout(() => { if (beatBar) beatBar.style.width = '0%'; }, 150);
			}

			// BPM display
			const bpmEl = this.querySelector('#midi-bpm-display');
			if (bpmEl) bpmEl.textContent = `${midiSync.bpm || '--'} BPM`;
		});

		midiSync.onMessage((msg) => {
			// Last message display
			const lastEl = this.querySelector('#midi-last-msg');
			if (lastEl) {
				if (msg.type === 'noteon') lastEl.textContent = `N${msg.note} v${msg.velocity}`;
				else if (msg.type === 'cc') lastEl.textContent = `CC${msg.cc}=${msg.value}`;
				else lastEl.textContent = msg.type;
			}

			// Note bars — map note to one of 16 bars
			if (msg.type === 'noteon' && msg.note !== undefined && msg.velocity) {
				const barIndex = Math.floor((msg.note % 128) / 8);
				if (barIndex < 16) this.noteDecay[barIndex] = msg.velocity / 127;
			}
		});
	}

	private async enumerateAudioDevices(): Promise<void> {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioDevices = devices.filter(d => d.kind === 'audioinput');
			const select = this.querySelector('#audio-source') as HTMLSelectElement;
			if (!select) return;
			const prev = select.value;
			select.innerHTML = '<option value="">Default</option>' +
				audioDevices.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId.slice(0, 12)}</option>`).join('');
			if (prev && audioDevices.some(d => d.deviceId === prev)) {
				select.value = prev;
			}
		} catch {
			// No permission yet — will populate after mic is started
		}
	}

	private selectedAudioOutput = localStorage.getItem('promap-audio-output') || '';

	private async enumerateAudioOutputDevices(): Promise<void> {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const outputs = devices.filter(d => d.kind === 'audiooutput');
			const select = this.querySelector('#audio-output') as HTMLSelectElement;
			if (!select) return;
			select.innerHTML = '<option value="">Default</option>' +
				outputs.map(d => `<option value="${d.deviceId}"${d.deviceId === this.selectedAudioOutput ? ' selected' : ''}>${d.label || d.deviceId.slice(0, 12)}</option>`).join('');
		} catch {
			// ignore
		}
	}

	private setAudioOutput(deviceId: string): void {
		this.selectedAudioOutput = deviceId;
		localStorage.setItem('promap-audio-output', deviceId);
		document.querySelectorAll('video, audio').forEach(el => {
			const media = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
			media.setSinkId?.(deviceId).catch(() => {});
		});
	}

	private renderDownloadedList(): void {
		const list = this.querySelector('#downloaded-list') as HTMLElement;
		if (!list) return;

		try {
			const videoData = localStorage.getItem('promap-pixabay-cache');
			const vectorData = localStorage.getItem('promap-pixabay-vectors');
			const videos: Array<{ id: number; filename: string; name: string; thumbnail: string; user: string }> = videoData ? JSON.parse(videoData) : [];
			const vectors: Array<{ id: number; filename: string; name: string; thumbnail: string; user: string }> = vectorData ? JSON.parse(vectorData) : [];

			if (videos.length === 0 && vectors.length === 0) {
				list.innerHTML = '<div class="text-xs text-neutral-500 text-center py-2">No downloads yet</div>';
				return;
			}

			const renderItem = (v: typeof videos[0], type: 'video' | 'image', icon: string) => {
				const inResources = state.getResources().some(r => r.src === `media://${v.filename}`);
				return `
					<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 mb-0.5 group">
						${v.thumbnail ? `<img src="${v.thumbnail}" draggable="false" class="w-10 h-7 object-cover rounded border border-neutral-700 shrink-0 pointer-events-none" alt="">` : `<div class="w-10 h-7 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">${icon}</div>`}
						<div class="flex-1 min-w-0">
							<div class="text-xs text-neutral-300 truncate">${v.name}</div>
							<div class="text-xs text-neutral-600 truncate">by ${v.user || 'Pixabay'}</div>
						</div>
						${inResources
							? '<span class="text-xs text-green-600 shrink-0">✓</span>'
							: `<button data-add-downloaded="${v.id}" data-add-type="${type}" class="text-xs text-blue-400 hover:text-blue-300 shrink-0 opacity-0 group-hover:opacity-100">+ Add</button>`
						}
					</div>
				`;
			};

			let html = '';
			if (videos.length > 0) {
				html += `<div class="text-xs text-neutral-500 font-semibold uppercase tracking-wide mb-1 mt-1">Videos (${videos.length})</div>`;
				html += videos.map(v => renderItem(v, 'video', '▶')).join('');
			}
			if (vectors.length > 0) {
				html += `<div class="text-xs text-neutral-500 font-semibold uppercase tracking-wide mb-1 mt-2">Vectors (${vectors.length})</div>`;
				html += vectors.map(v => renderItem(v, 'image', '◇')).join('');
			}

			list.innerHTML = html;

			const allCached = [...videos, ...vectors];

			list.querySelectorAll<HTMLElement>('[data-add-downloaded]').forEach(btn => {
				btn.addEventListener('click', () => {
					const id = parseInt(btn.dataset.addDownloaded!);
					const type = (btn.dataset.addType as 'video' | 'image') || 'video';
					const v = allCached.find(c => c.id === id);
					if (v) {
						state.addResource({
							name: v.name,
							type,
							src: `media://${v.filename}`,
							thumbnail: v.thumbnail || undefined,
						});
						this.renderDownloadedList();
					}
				});
			});
		} catch {
			list.innerHTML = '<div class="text-xs text-neutral-500 text-center py-2">Error loading cache</div>';
		}
	}

	private updateProlinkDevice(status: { deviceId: number; deviceName: string; bpm: number; beat: number; playing: boolean; master: boolean }): void {
		const devList = this.querySelector('#prolink-devices');
		if (!devList) return;

		let el = devList.querySelector(`[data-prolink-id="${status.deviceId}"]`) as HTMLElement;
		if (!el) {
			// Remove placeholder
			const placeholder = devList.querySelector('.text-center');
			if (placeholder) placeholder.remove();

			el = document.createElement('div');
			el.dataset.prolinkId = String(status.deviceId);
			el.className = 'flex items-center gap-2 px-2 py-1 rounded bg-neutral-800 text-xs';
			devList.appendChild(el);
		}

		const beatDots = [1, 2, 3, 4].map(b =>
			`<div class="w-1.5 h-1.5 rounded-full ${b === status.beat && status.playing ? 'bg-orange-400' : 'bg-neutral-700'}"></div>`
		).join('');

		el.innerHTML = `
			<span class="w-2 h-2 rounded-full ${status.playing ? 'bg-green-400' : 'bg-neutral-600'} shrink-0"></span>
			<span class="text-neutral-300 truncate flex-1">${status.deviceName}</span>
			${status.master ? '<span class="text-xs text-orange-400 font-semibold">M</span>' : ''}
			<span class="text-neutral-400 font-mono">${status.bpm.toFixed(1)}</span>
			<div class="flex gap-0.5">${beatDots}</div>
		`;
	}

	private async populateScreenSelectors(): Promise<void> {
		try {
			const screens = await window.promap.getScreens();
			this.querySelectorAll<HTMLSelectElement>('[data-proj-screen]').forEach(sel => {
				const projId = parseInt(sel.dataset.projScreen!);
				const config = state.projectorConfigs.get(projId);
				const currentScreenId = config?.screenId;

				sel.innerHTML = '<option value="">Windowed</option>' +
					screens.map(s =>
						`<option value="${s.id}" ${currentScreenId === s.id ? 'selected' : ''}>${s.label || `Display ${s.id}`} (${s.width}×${s.height})${s.primary ? ' ★' : ''}</option>`
					).join('');
			});
		} catch {
			// Screens not available
		}
	}

	private populateMidiDevices(): void {
		const select = this.querySelector('#midi-device') as HTMLSelectElement;
		if (!select) return;
		const devices = midiSync.devices;
		select.innerHTML = '<option value="">All devices</option>' +
			devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
	}

	private startMeter(): void {
		this.setupMidiVisuals();

		const tick = (): void => {
			this.meterRafId = requestAnimationFrame(tick);

			// MIDI note bar decay
			for (let i = 0; i < 16; i++) {
				if (this.noteDecay[i] > 0) {
					const bar = this.querySelector(`#midi-note-bar-${i}`) as HTMLElement;
					if (bar) {
						const pct = Math.round(this.noteDecay[i] * 100);
						bar.style.height = `${pct}%`;
						if (pct > 80) bar.className = 'bg-red-500 rounded-t';
						else if (pct > 50) bar.className = 'bg-yellow-500 rounded-t';
						else bar.className = 'bg-purple-500 rounded-t';
					}
					this.noteDecay[i] *= 0.92; // decay
					if (this.noteDecay[i] < 0.01) this.noteDecay[i] = 0;
				}
			}

			if (!audioAnalyzer.running) return;

			const level = audioAnalyzer.level;
			const pct = Math.min(100, Math.round(level * 100));
			const db = level > 0 ? Math.max(-60, Math.round(20 * Math.log10(level))) : -Infinity;

			// Level bar
			const bar = this.querySelector('#meter-bar') as HTMLElement;
			if (bar) {
				bar.style.width = `${pct}%`;
				if (pct > 80) {
					bar.className = 'h-full bg-red-500 rounded';
				} else if (pct > 50) {
					bar.className = 'h-full bg-yellow-500 rounded';
				} else {
					bar.className = 'h-full bg-green-500 rounded';
				}
			}

			// dB display
			const dbEl = this.querySelector('#meter-db');
			if (dbEl) dbEl.textContent = isFinite(db) ? `${db} dB` : '-∞ dB';

			// Peak display
			const peakEl = this.querySelector('#meter-peak');
			if (peakEl) peakEl.textContent = `${pct}%`;

			// Active dot — green when above threshold, red when below
			const activeDot = this.querySelector('#meter-active-dot') as HTMLElement;
			if (activeDot) {
				activeDot.className = `w-2 h-2 rounded-full ${audioAnalyzer.isAboveThreshold ? 'bg-green-400' : 'bg-red-500'}`;
			}

			// Beat detection dot
			const beatDot = this.querySelector('#meter-beat-dot') as HTMLElement;
			if (beatDot) {
				beatDot.className = `w-2 h-2 rounded-full ${audioAnalyzer.beatDetected ? 'bg-yellow-400' : 'bg-neutral-700'}`;
			}

			// BPM from beat detection
			const bpmEl = this.querySelector('#meter-bpm');
			if (bpmEl) {
				bpmEl.textContent = audioAnalyzer.bpm > 0 ? `${audioAnalyzer.bpm} BPM` : '';
			}

			// Frequency bars
			const analyser = audioAnalyzer.analyser;
			if (analyser) {
				const freqData = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(freqData);
				const barCount = 32;
				const binSize = Math.floor(freqData.length / barCount);
				for (let i = 0; i < barCount; i++) {
					let sum = 0;
					for (let j = 0; j < binSize; j++) {
						sum += freqData[i * binSize + j];
					}
					const avg = sum / binSize / 255 * 100;
					const freqBar = this.querySelector(`#freq-bar-${i}`) as HTMLElement;
					if (freqBar) {
						freqBar.style.height = `${avg}%`;
						if (avg > 80) {
							freqBar.className = 'bg-red-500 rounded-t';
						} else if (avg > 50) {
							freqBar.className = 'bg-yellow-500 rounded-t';
						} else {
							freqBar.className = 'bg-green-500 rounded-t';
						}
					}
				}
			}
		};
		tick();
	}

	private async addMedia(): Promise<void> {
		const files = await window.promap.uploadMedia();
		for (const file of files) {
			const src = `media://${file.filename}`;
			if (file.type === 'stl') {
				state.addResource({
					name: file.name,
					type: 'stl',
					src,
					stlOptions: { rotationSpeed: 1 },
				});
			} else {
				const thumbnail = file.type === 'video'
					? await this.generateVideoThumbnail(src)
					: src;
				state.addResource({
					name: file.name,
					type: file.type as 'video' | 'image',
					src,
					thumbnail,
				});
			}
		}
	}

	private generateVideoThumbnail(src: string): Promise<string> {
		return new Promise((resolve) => {
			const video = document.createElement('video');
			video.src = src;
			video.muted = true;
			video.preload = 'auto';
			video.crossOrigin = 'anonymous';

			video.addEventListener('loadeddata', () => {
				video.currentTime = 0;
			});

			video.addEventListener('seeked', () => {
				const canvas = document.createElement('canvas');
				canvas.width = 64;
				canvas.height = 36;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL('image/jpeg', 0.7));
				video.remove();
			});

			// Fallback if video fails to load
			video.addEventListener('error', () => {
				resolve('');
				video.remove();
			});
		});
	}

	private addText(): void {
		const modal = document.querySelector('text-modal') as TextModal | null;
		if (modal) modal.show();
	}

	private addColor(): void {
		const modal = document.querySelector('color-modal') as ColorModal | null;
		if (modal) modal.show();
	}

	private renderList(): void {
		const list = this.querySelector('#resources-list');
		if (!list) return;

		const resources = state.getResources();
		if (resources.length === 0) {
			list.innerHTML = '<div class="text-xs text-neutral-500 text-center py-8">No resources</div>';
			return;
		}

		list.innerHTML = resources.map(r => this.renderItem(r)).join('');

		list.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				state.removeResource(btn.dataset.remove!);
			});
		});

		list.querySelectorAll<HTMLElement>('[data-resource-id]').forEach(el => {
			el.addEventListener('dragstart', (e) => {
				e.dataTransfer?.setData('text/plain', el.dataset.resourceId!);
			});
			el.addEventListener('dblclick', () => {
				const res = state.getResources().find(r => r.id === el.dataset.resourceId);
				if (res?.type === 'text') {
					(document.querySelector('text-modal') as TextModal | null)?.show(res.id);
				} else if (res?.type === 'color') {
					(document.querySelector('color-modal') as ColorModal | null)?.show(res.id);
				}
			});
		});

		this.renderTemplates();
	}

	private renderTemplates(): void {
		const tmplList = this.querySelector('#shape-templates-list');
		if (!tmplList) return;

		const templates = state.shapeTemplates;
		if (templates.length === 0) {
			tmplList.innerHTML = '<div class="text-xs text-neutral-500 text-center py-2">No saved shapes</div>';
			return;
		}

		tmplList.innerHTML = templates.map(t => `
			<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 mb-1 group">
				<div class="w-10 h-7 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">SVG</div>
				<span class="text-xs text-neutral-300 truncate flex-1">${t.name}</span>
				<button data-use-template="${t.id}" class="text-xs text-green-500 hover:text-green-400 opacity-0 group-hover:opacity-100" title="Create shape">+</button>
				<button data-remove-template="${t.id}" class="text-xs text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100" title="Delete">✕</button>
			</div>
		`).join('');

		tmplList.querySelectorAll<HTMLButtonElement>('[data-use-template]').forEach(btn => {
			btn.addEventListener('click', () => {
				state.createShapeFromTemplate(btn.dataset.useTemplate!);
			});
		});

		tmplList.querySelectorAll<HTMLButtonElement>('[data-remove-template]').forEach(btn => {
			btn.addEventListener('click', () => {
				state.removeShapeTemplate(btn.dataset.removeTemplate!);
				this.renderList();
			});
		});
	}

	private renderItem(r: ResourceData): string {
		const thumbSrc = r.thumbnail || r.src;
		const hasThumb = thumbSrc && thumbSrc.length > 0 && r.type !== 'stl';
		const icon = r.type === 'stl' ? '3D' : r.type === 'color' ? 'C' : 'T';

		return `
			<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 cursor-grab mb-1 group" draggable="true" data-resource-id="${r.id}">
				${hasThumb
					? `<img src="${thumbSrc}" draggable="false" class="w-10 h-7 object-cover rounded border border-neutral-700 shrink-0 pointer-events-none" alt="">`
					: `<div class="w-10 h-7 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">${icon}</div>`
				}
				<span class="text-xs text-neutral-300 truncate flex-1">${r.name}</span>
				<button data-remove="${r.id}" class="text-xs text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100">✕</button>
			</div>
		`;
	}
}

customElements.define('resources-panel', ResourcesPanel);
