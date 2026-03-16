import { state } from '../state/state-manager';
import { KeyframeData } from '../types';

const PX_PER_SEC = 10;
const TRACK_HEIGHT = 24;

function timeToX(ms: number): number {
	return (ms / 1000) * PX_PER_SEC;
}

function xToTime(px: number): number {
	return (px / PX_PER_SEC) * 1000;
}

function formatTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	const frac = Math.floor((ms % 1000) / 10);
	return `${min}:${sec.toString().padStart(2, '0')}.${frac.toString().padStart(2, '0')}`;
}

interface DragState {
	type: 'playhead' | 'keyframe';
	shapeId?: string;
	keyframeId?: string;
}

export class TimelinePanel extends HTMLElement {
	private drag: DragState | null = null;
	private scrollContainer: HTMLElement | null = null;
	private popoverShapeId: string | null = null;
	private popoverKfId: string | null = null;

	connectedCallback(): void {
		this.className = 'block h-full bg-neutral-900 border-t border-neutral-700';
		this.render();
		this.setupListeners();
		state.subscribe(() => this.updateView());
	}

	private render(): void {
		const totalWidth = timeToX(state.timelineDuration);

		this.innerHTML = `
			<div class="flex flex-col h-full">
				<div class="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-700 shrink-0">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Timeline</h2>
					<div class="flex-1"></div>
					<button id="tl-play" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">${state.timelinePlaying ? '⏸' : '▶'}</button>
					<button id="tl-stop" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">⏹</button>
					<span id="tl-time" class="text-xs text-neutral-400 font-mono w-20 text-right">${formatTime(state.timelineTime)}</span>
					<div class="h-4 w-px bg-neutral-700"></div>
					<button id="tl-keyframe" class="px-2 py-0.5 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">+ Keyframe</button>
				</div>

				<div class="flex flex-1 min-h-0 overflow-hidden">
					<div id="tl-labels" class="w-32 shrink-0 border-r border-neutral-700 overflow-y-auto">
						${this.renderLabels()}
					</div>

					<div id="tl-scroll" class="flex-1 overflow-x-auto overflow-y-auto relative">
						<div id="tl-ruler" class="h-5 border-b border-neutral-700 sticky top-0 bg-neutral-900 z-10 relative cursor-pointer" style="min-width: ${totalWidth}px;">
							${this.renderRuler(totalWidth)}
						</div>

						<div id="tl-tracks" class="relative" style="min-width: ${totalWidth}px;">
							${this.renderTracks(totalWidth)}
							<div id="tl-playhead" class="absolute top-0 bottom-0 w-px bg-blue-500 z-20 pointer-events-none" style="left: ${timeToX(state.timelineTime)}px;"></div>
						</div>
					</div>
				</div>
			</div>

			<div id="kf-popover" class="fixed z-50 hidden"></div>
		`;
	}

	private renderLabels(): string {
		const shapes = state.getShapes();
		if (shapes.length === 0) {
			return '<div class="text-xs text-neutral-500 text-center py-6">No shapes</div>';
		}
		return shapes.map(s => `
			<div class="flex items-center px-2 text-xs text-neutral-400 border-b border-neutral-800 hover:bg-neutral-800" style="height: ${TRACK_HEIGHT}px;">
				<button class="mr-1 text-xs ${s.visible === false ? 'text-neutral-600' : 'text-neutral-400'} hover:text-neutral-200" data-toggle-visible="${s.id}" title="Toggle visibility">${s.visible === false ? '◇' : '◆'}</button>
				<span class="truncate flex-1 cursor-pointer" data-shape-label="${s.id}">${s.name}</span>
			</div>
		`).join('');
	}

	private renderRuler(totalWidth: number): string {
		let marks = '';
		const totalSec = Math.ceil(totalWidth / PX_PER_SEC);
		for (let s = 0; s <= totalSec; s++) {
			const x = s * PX_PER_SEC;
			const isMajor = s % 10 === 0;
			const isMinor = s % 5 === 0;
			if (isMajor) {
				const min = Math.floor(s / 60);
				const sec = s % 60;
				marks += `<div class="absolute text-neutral-500 select-none" style="left: ${x}px; font-size: 9px; bottom: 6px;">${min}:${sec.toString().padStart(2, '0')}</div>`;
				marks += `<div class="absolute bg-neutral-600 bottom-0" style="left: ${x}px; width: 1px; height: 8px;"></div>`;
			} else if (isMinor) {
				marks += `<div class="absolute bg-neutral-700 bottom-0" style="left: ${x}px; width: 1px; height: 5px;"></div>`;
			}
		}
		marks += `<div id="tl-playhead-top" class="absolute bottom-0 z-20" style="left: ${timeToX(state.timelineTime)}px;">
			<div class="w-2 h-2 bg-blue-500 -ml-1 rotate-45"></div>
		</div>`;
		return marks;
	}

	private renderTracks(totalWidth: number): string {
		const shapes = state.getShapes();
		if (shapes.length === 0) return '';

		return shapes.map(s => {
			const keyframes = state.getKeyframes(s.id);
			const kfMarks = keyframes.map(k => {
				const x = timeToX(k.time);
				const isSelected = k.id === this.popoverKfId;
				const color = isSelected ? 'bg-orange-400' : 'bg-yellow-500 hover:bg-yellow-400';
				return `<div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 ${color} rotate-45 cursor-grab z-10" style="left: ${x - 6}px;" data-kf-shape="${s.id}" data-kf-id="${k.id}" title="${formatTime(k.time)}"></div>`;
			}).join('');

			let morphRegions = '';
			for (let i = 0; i < keyframes.length - 1; i++) {
				if (keyframes[i].morphToNext) {
					const x1 = timeToX(keyframes[i].time + keyframes[i].holdTime);
					const x2 = timeToX(keyframes[i + 1].time);
					if (x2 > x1) {
						morphRegions += `<div class="absolute top-1 bottom-1 bg-blue-500/20 rounded" style="left: ${x1}px; width: ${x2 - x1}px;"></div>`;
					}
				}
			}

			return `<div class="relative border-b border-neutral-800" style="height: ${TRACK_HEIGHT}px; min-width: ${totalWidth}px;">
				${morphRegions}${kfMarks}
			</div>`;
		}).join('');
	}

	private setupListeners(): void {
		this.querySelector('#tl-play')?.addEventListener('click', () => {
			if (state.timelinePlaying) state.pauseTimeline();
			else state.playTimeline();
		});

		this.querySelector('#tl-stop')?.addEventListener('click', () => state.stopTimeline());

		this.querySelector('#tl-keyframe')?.addEventListener('click', () => {
			const selected = state.getSelectedShape();
			if (selected) state.insertKeyframe(selected.id);
		});

		const ruler = this.querySelector('#tl-ruler') as HTMLElement;
		ruler?.addEventListener('mousedown', (e) => {
			this.hidePopover();
			this.drag = { type: 'playhead' };
			this.seekFromEvent(e);
		});

		this.querySelectorAll<HTMLElement>('[data-shape-label]').forEach(el => {
			el.addEventListener('click', () => state.selectShape(el.dataset.shapeLabel!));
		});

		this.querySelectorAll<HTMLElement>('[data-toggle-visible]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const id = btn.dataset.toggleVisible!;
				const shape = state.getShapes().find(s => s.id === id);
				if (shape) state.updateShape(id, { visible: shape.visible === false ? true : false });
			});
		});

		this.bindKeyframeEvents();

		document.addEventListener('mousemove', (e) => this.onMouseMove(e));
		document.addEventListener('mouseup', () => this.onMouseUp());

		this.scrollContainer = this.querySelector('#tl-scroll');
	}

	private bindKeyframeEvents(): void {
		this.querySelectorAll<HTMLElement>('[data-kf-id]').forEach(el => {
			el.addEventListener('mousedown', (e) => {
				e.stopPropagation();
				this.drag = {
					type: 'keyframe',
					shapeId: el.dataset.kfShape!,
					keyframeId: el.dataset.kfId!,
				};
			});

			el.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showPopover(el.dataset.kfShape!, el.dataset.kfId!, e);
			});

			el.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				state.removeKeyframe(el.dataset.kfShape!, el.dataset.kfId!);
				this.hidePopover();
			});
		});
	}

	private onMouseMove(e: MouseEvent): void {
		if (!this.drag) return;

		const ruler = this.querySelector('#tl-ruler') as HTMLElement;
		if (!ruler) return;
		const rect = ruler.getBoundingClientRect();
		const scrollLeft = this.scrollContainer?.scrollLeft ?? 0;
		const x = e.clientX - rect.left + scrollLeft;
		const time = xToTime(Math.max(0, x));

		if (this.drag.type === 'playhead') {
			state.setTimelineTime(time);
		} else if (this.drag.type === 'keyframe' && this.drag.shapeId && this.drag.keyframeId) {
			state.moveKeyframe(this.drag.shapeId, this.drag.keyframeId, time);
			this.hidePopover();
		}
	}

	private onMouseUp(): void {
		this.drag = null;
	}

	private seekFromEvent(e: MouseEvent): void {
		const ruler = this.querySelector('#tl-ruler') as HTMLElement;
		if (!ruler) return;
		const rect = ruler.getBoundingClientRect();
		const scrollLeft = this.scrollContainer?.scrollLeft ?? 0;
		const x = e.clientX - rect.left + scrollLeft;
		state.setTimelineTime(xToTime(Math.max(0, x)));
	}

	private showPopover(shapeId: string, kfId: string, e: MouseEvent): void {
		const kfs = state.getKeyframes(shapeId);
		const kf = kfs.find(k => k.id === kfId);
		if (!kf) return;

		this.popoverShapeId = shapeId;
		this.popoverKfId = kfId;

		const popover = this.querySelector('#kf-popover') as HTMLElement;
		if (!popover) return;

		popover.className = 'fixed z-50 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl p-3 space-y-2';
		popover.style.left = `${e.clientX}px`;
		popover.style.top = `${e.clientY - 160}px`;

		popover.innerHTML = `
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs font-semibold text-neutral-300">Keyframe at ${formatTime(kf.time)}</span>
				<button id="pop-close" class="text-neutral-500 hover:text-neutral-300 text-sm">&times;</button>
			</div>

			<label class="text-xs text-neutral-400 flex items-center gap-1.5">
				<input id="pop-morph" type="checkbox" ${kf.morphToNext ? 'checked' : ''} class="accent-blue-500">
				Morph to next
			</label>

			<div>
				<label class="text-xs text-neutral-400 block mb-0.5">Easing</label>
				<select id="pop-easing" class="w-full px-2 py-1 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-300">
					<option value="linear" ${kf.easingType === 'linear' ? 'selected' : ''}>Linear</option>
					<option value="ease-in" ${kf.easingType === 'ease-in' ? 'selected' : ''}>Ease In</option>
					<option value="ease-out" ${kf.easingType === 'ease-out' ? 'selected' : ''}>Ease Out</option>
					<option value="ease-in-out" ${kf.easingType === 'ease-in-out' ? 'selected' : ''}>Ease In-Out</option>
				</select>
			</div>

			<div>
				<label class="text-xs text-neutral-400 block mb-0.5">Hold time (sec)</label>
				<input id="pop-hold" type="number" min="0" step="0.1" value="${(kf.holdTime / 1000).toFixed(1)}" class="w-full px-2 py-1 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-300">
			</div>

			<div>
				<label class="text-xs text-neutral-400 block mb-0.5">Transition Effect</label>
				<select id="pop-transition" class="w-full px-2 py-1 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-300">
					<option value="none" ${(kf.transitionEffect ?? 'none') === 'none' ? 'selected' : ''}>None</option>
					<option value="fade" ${kf.transitionEffect === 'fade' ? 'selected' : ''}>Fade (blur)</option>
					<option value="flash" ${kf.transitionEffect === 'flash' ? 'selected' : ''}>Flash (glow)</option>
					<option value="dissolve" ${kf.transitionEffect === 'dissolve' ? 'selected' : ''}>Dissolve (glitch)</option>
				</select>
			</div>

			<button id="pop-delete" class="w-full px-2 py-1 text-xs bg-red-900 hover:bg-red-800 rounded border border-red-700 text-red-300">Delete Keyframe</button>
		`;

		popover.querySelector('#pop-close')?.addEventListener('click', () => this.hidePopover());

		popover.querySelector('#pop-morph')?.addEventListener('change', (ev) => {
			state.updateKeyframe(shapeId, kfId, { morphToNext: (ev.target as HTMLInputElement).checked });
		});

		popover.querySelector('#pop-easing')?.addEventListener('change', (ev) => {
			state.updateKeyframe(shapeId, kfId, { easingType: (ev.target as HTMLSelectElement).value as KeyframeData['easingType'] });
		});

		popover.querySelector('#pop-hold')?.addEventListener('change', (ev) => {
			const sec = parseFloat((ev.target as HTMLInputElement).value) || 0;
			state.updateKeyframe(shapeId, kfId, { holdTime: sec * 1000 });
		});

		popover.querySelector('#pop-transition')?.addEventListener('change', (ev) => {
			state.updateKeyframe(shapeId, kfId, { transitionEffect: (ev.target as HTMLSelectElement).value as KeyframeData['transitionEffect'] });
		});

		popover.querySelector('#pop-delete')?.addEventListener('click', () => {
			state.removeKeyframe(shapeId, kfId);
			this.hidePopover();
		});
	}

	private hidePopover(): void {
		this.popoverShapeId = null;
		this.popoverKfId = null;
		const popover = this.querySelector('#kf-popover') as HTMLElement;
		if (popover) {
			popover.className = 'fixed z-50 hidden';
			popover.innerHTML = '';
		}
	}

	private updateView(): void {
		const timeEl = this.querySelector('#tl-time');
		if (timeEl) timeEl.textContent = formatTime(state.timelineTime);

		const playBtn = this.querySelector('#tl-play');
		if (playBtn) playBtn.textContent = state.timelinePlaying ? '⏸' : '▶';

		const playhead = this.querySelector('#tl-playhead') as HTMLElement;
		if (playhead) playhead.style.left = `${timeToX(state.timelineTime)}px`;

		const playheadTop = this.querySelector('#tl-playhead-top') as HTMLElement;
		if (playheadTop) playheadTop.style.left = `${timeToX(state.timelineTime)}px`;

		const labels = this.querySelector('#tl-labels') as HTMLElement;
		const tracks = this.querySelector('#tl-tracks') as HTMLElement;
		if (labels && tracks) {
			const shapes = state.getShapes();
			const currentTracks = tracks.querySelectorAll(':scope > div:not(#tl-playhead)').length;

			if (currentTracks !== shapes.length) {
				this.render();
				this.setupListeners();
			} else {
				const totalWidth = timeToX(state.timelineDuration);
				tracks.innerHTML = this.renderTracks(totalWidth) +
					`<div id="tl-playhead" class="absolute top-0 bottom-0 w-px bg-blue-500 z-20 pointer-events-none" style="left: ${timeToX(state.timelineTime)}px;"></div>`;
				this.bindKeyframeEvents();
			}
		}
	}
}

customElements.define('timeline-panel', TimelinePanel);
