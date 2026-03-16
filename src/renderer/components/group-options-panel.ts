import { state } from '../state/state-manager';
import { ShapeData, ProjectionType, GroupAnimationOptions } from '../types';
import { MaskPositionModal } from './mask-position-modal';
import { audioAnalyzer } from '../audio/audio-analyzer';

export class GroupOptionsPanel extends HTMLElement {
	private currentGroupId: string | null = null;
	private updating = false;

	connectedCallback(): void {
		this.className = 'block';
		this.renderList();
		state.subscribe(() => this.onStateChange());
	}

	private onStateChange(): void {
		if (this.updating) return;

		const group = state.getSelectedGroup();
		if (!group) {
			if (this.currentGroupId !== null) {
				this.currentGroupId = null;
				this.renderList();
			} else {
				// Update list in case groups changed
				this.renderList();
			}
			return;
		}

		if (group.id !== this.currentGroupId) {
			this.currentGroupId = group.id;
			this.renderForm(group);
		}
	}

	private renderList(): void {
		const groups = state.getGroups();
		if (groups.size === 0) {
			this.innerHTML = `
				<div class="p-3">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Groups</h2>
					<div class="text-xs text-neutral-500 text-center py-8">No groups<br><span class="text-neutral-600 mt-1 block">Shift+click shapes to create</span></div>
				</div>
			`;
			return;
		}

		let listHtml = '';
		for (const [id, group] of groups) {
			listHtml += `
				<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 cursor-pointer mb-1" data-select-group="${id}">
					<span class="text-xs text-neutral-400">▣</span>
					<span class="text-xs text-neutral-300 truncate flex-1">${group.name}</span>
					<span class="text-xs text-neutral-500">${group.shapeIds.length}</span>
				</div>
			`;
		}

		this.innerHTML = `
			<div class="p-3">
				<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Groups</h2>
				${listHtml}
			</div>
		`;

		this.querySelectorAll<HTMLElement>('[data-select-group]').forEach(el => {
			el.addEventListener('click', () => {
				state.selectGroup(el.dataset.selectGroup!);
			});
		});
	}

	private renderForm(group: { id: string; name: string; shapeIds: string[] }): void {
		const shapes = state.getShapes();
		const groupShapes = group.shapeIds.map(id => shapes.find(s => s.id === id)).filter(Boolean) as ShapeData[];
		const availableShapes = shapes.filter(s => !group.shapeIds.includes(s.id));

		this.innerHTML = `
			<div class="p-3 space-y-3">
				<div class="flex items-center gap-2">
					<button id="grp-back" class="text-xs text-neutral-500 hover:text-neutral-300">←</button>
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Group Options</h2>
				</div>

				<!-- Name -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Name</label>
					<input id="grp-name" type="text" value="${group.name}" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
				</div>

				<!-- Actions -->
				<div class="flex gap-1.5">
					<button id="grp-delete" class="flex-1 px-2 py-1 text-xs bg-red-900 hover:bg-red-800 rounded border border-red-700 text-red-300">Delete Group</button>
				</div>

				<div class="h-px bg-neutral-700"></div>

				<!-- Shapes in group -->
				<div>
					<div class="flex items-center justify-between mb-1">
						<label class="text-xs text-neutral-400">Shapes (${groupShapes.length})</label>
						<div class="flex gap-1">
							<button id="grp-show-all" class="px-1.5 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-400" title="Show all">◆</button>
							<button id="grp-hide-all" class="px-1.5 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-400" title="Hide all">◇</button>
						</div>
					</div>
					<div id="grp-shapes" class="space-y-1 max-h-40 overflow-y-auto">
						${groupShapes.map((s, i) => `
							<div class="flex items-center gap-1 px-1.5 py-1 rounded bg-neutral-800 text-xs text-neutral-300 ${s.visible === false ? 'opacity-40' : ''}">
								<button data-grp-toggle-vis="${s.id}" class="text-xs ${s.visible === false ? 'text-neutral-600' : 'text-neutral-400'} hover:text-neutral-200 shrink-0" title="Toggle visibility">${s.visible === false ? '◇' : '◆'}</button>
								<span class="flex-1 truncate cursor-pointer hover:text-blue-400" data-grp-select-shape="${s.id}">${s.name}</span>
								${i > 0 ? `<button data-grp-move-up="${i}" class="text-neutral-500 hover:text-neutral-300" title="Move up">↑</button>` : ''}
								${i < groupShapes.length - 1 ? `<button data-grp-move-down="${i}" class="text-neutral-500 hover:text-neutral-300" title="Move down">↓</button>` : ''}
								<button data-grp-remove-shape="${s.id}" class="text-neutral-500 hover:text-red-400" title="Remove from group">✕</button>
							</div>
						`).join('')}
					</div>

					${availableShapes.length > 0 ? `
					<div class="flex gap-1 mt-1.5">
						<select id="grp-add-shape-select" class="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							${availableShapes.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
						</select>
						<button id="grp-add-shape" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+</button>
					</div>
					` : ''}
				</div>

				<div class="h-px bg-neutral-700"></div>

				<!-- Group playback -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Playback (all)</label>
					<div class="flex gap-1.5 items-center mb-1.5">
						<button id="grp-play" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">▶ Play All</button>
						<button id="grp-pause" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">⏸ Pause All</button>
					</div>
					<div class="flex items-center gap-1 mb-1.5">
						<label class="text-xs text-neutral-400 flex items-center gap-1">
							FPS
							<input id="grp-fps" type="range" min="1" max="120" value="30" class="w-20 accent-blue-500">
							<span id="grp-fps-value" class="text-xs text-neutral-300 w-6 text-right">30</span>
						</label>
					</div>
					<label class="text-xs text-neutral-400 flex items-center gap-1.5"><input id="grp-loop" type="checkbox" checked class="accent-blue-500"> Loop all</label>
				</div>

				<!-- Resource -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Resource (all)</label>
					<select id="grp-resource" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						<option value="">— Don't change —</option>
						<option value="__none__">None</option>
						${state.getResources().map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
					</select>
				</div>

				<!-- Projection Type -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Projection Type (all)</label>
					${this.renderGroupProjection(group)}
				</div>

				<div class="h-px bg-neutral-700"></div>

				<!-- Animation -->
				${this.renderGroupAnimation(group)}

				<div class="h-px bg-neutral-700"></div>

				<!-- Effects -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Effects (all)</label>
					<div class="space-y-2">
						${this.renderEffect('blur', 'Blur')}
						${this.renderEffect('glow', 'Glow')}
						${this.renderEffect('colorCorrection', 'Color Correction')}
						${this.renderEffect('distortion', 'Distortion')}
						${this.renderEffect('glitch', 'Glitch')}
					</div>
				</div>
			</div>
		`;

		this.setupFormListeners(group.id);
	}

	private renderGroupAnimation(group: { id: string; name: string; shapeIds: string[]; animation?: GroupAnimationOptions; animationPlaying?: boolean }): string {
		const anim = group.animation ?? { mode: 'none', fadeDuration: 500, holdDuration: 1000, loop: true, autoPlayResource: false };
		const isPlaying = !!group.animationPlaying;

		return `
			<div>
				<label class="text-xs text-neutral-400 block mb-1">Sequence Animation</label>
				<select id="grp-anim-mode" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 mb-2">
					<option value="none" ${anim.mode === 'none' ? 'selected' : ''}>None</option>
					<option value="series" ${anim.mode === 'series' ? 'selected' : ''}>In Order (series)</option>
					<option value="random" ${anim.mode === 'random' ? 'selected' : ''}>Random</option>
					<option value="from-middle" ${anim.mode === 'from-middle' ? 'selected' : ''}>From Middle</option>
				</select>

				<div id="grp-anim-options" class="${anim.mode === 'none' ? 'hidden' : ''} space-y-2">
					<label class="text-xs text-neutral-400 flex items-center gap-1.5">
						<input id="grp-anim-bpm" type="checkbox" ${anim.useBpm ? 'checked' : ''} class="accent-blue-500"> Use BPM (mic)
					</label>
					<div id="grp-anim-timing" class="${anim.useBpm ? 'hidden' : ''} flex gap-2">
						<div class="flex-1">
							<label class="text-xs text-neutral-500 block mb-0.5">Fade (ms)</label>
							<input id="grp-anim-fade" type="number" value="${anim.fadeDuration}" min="0" step="100" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
						</div>
						<div class="flex-1">
							<label class="text-xs text-neutral-500 block mb-0.5">Hold (ms)</label>
							<input id="grp-anim-hold" type="number" value="${anim.holdDuration}" min="0" step="100" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
						</div>
					</div>
					<div>
						<label class="text-xs text-neutral-500 block mb-0.5">Easing</label>
						<select id="grp-anim-easing" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							<option value="linear" ${(anim.easing ?? 'linear') === 'linear' ? 'selected' : ''}>Linear</option>
							<option value="ease-in" ${anim.easing === 'ease-in' ? 'selected' : ''}>Ease In</option>
							<option value="ease-out" ${anim.easing === 'ease-out' ? 'selected' : ''}>Ease Out</option>
							<option value="ease-in-out" ${anim.easing === 'ease-in-out' ? 'selected' : ''}>Ease In-Out</option>
						</select>
					</div>
					<div class="flex gap-3">
						<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="grp-anim-loop" type="checkbox" ${anim.loop ? 'checked' : ''} class="accent-blue-500"> Loop</label>
						<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="grp-anim-autoplay" type="checkbox" ${anim.autoPlayResource ? 'checked' : ''} class="accent-blue-500"> Auto-play resource</label>
					</div>
					<div class="flex gap-1.5">
						<button id="grp-anim-play" class="flex-1 px-2 py-1 text-xs ${isPlaying ? 'bg-green-800 border-green-700 text-green-200' : 'bg-neutral-800 border-neutral-600 text-neutral-300'} hover:bg-neutral-700 rounded border">
							${isPlaying ? '⏸ Stop' : '▶ Play Sequence'}
						</button>
					</div>
				</div>
			</div>
		`;
	}

	private renderGroupProjection(group: { id: string; name: string; shapeIds: string[] }): string {
		const shapes = state.getShapes();
		const groupShapes = group.shapeIds.map(id => shapes.find(s => s.id === id)).filter(Boolean) as ShapeData[];
		const currentType = groupShapes.length > 0 ? groupShapes[0].projectionType : 'default';
		const isMaskOrMap = currentType === 'masked' || currentType === 'mapped';
		const sharedResource = isMaskOrMap && groupShapes.length > 0 ? groupShapes[0].resource : null;

		let html = `
			<select id="grp-projection" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
				<option value="default" ${currentType === 'default' ? 'selected' : ''}>Default (stretch)</option>
				<option value="fit" ${currentType === 'fit' ? 'selected' : ''}>Fit (aspect ratio)</option>
				<option value="masked" ${currentType === 'masked' ? 'selected' : ''}>Masked (move resource)</option>
				<option value="mapped" ${currentType === 'mapped' ? 'selected' : ''}>Mapped (move shapes)</option>
			</select>
		`;

		if (isMaskOrMap && sharedResource) {
			html += `
				<button id="grp-position-modal" class="w-full px-2 py-1 mt-2 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">
					${currentType === 'masked' ? 'Position Resource on Shapes' : 'Position Shapes on Resource'}
				</button>
			`;
		}

		return html;
	}

	private renderEffect(key: string, label: string): string {
		return `
			<div>
				<div class="flex justify-between text-xs text-neutral-500 mb-0.5">
					<span>${label}</span><span id="grp-fx-${key}-value">0%</span>
				</div>
				<input id="grp-fx-${key}" type="range" min="0" max="100" value="0" class="w-full accent-blue-500">
			</div>
		`;
	}

	private setupFormListeners(groupId: string): void {
		this.querySelector('#grp-back')?.addEventListener('click', () => {
			state.selectGroup(null);
			this.currentGroupId = null;
			this.renderList();
		});

		this.querySelector('#grp-name')?.addEventListener('change', (e) => {
			state.renameGroup(groupId, (e.target as HTMLInputElement).value);
		});

		this.querySelector('#grp-delete')?.addEventListener('click', () => {
			state.removeGroup(groupId);
			this.currentGroupId = null;
			this.renderList();
		});

		// Shape management
		this.querySelectorAll<HTMLElement>('[data-grp-select-shape]').forEach(el => {
			el.addEventListener('click', () => state.highlightShape(el.dataset.grpSelectShape!));
		});

		this.querySelectorAll<HTMLElement>('[data-grp-move-up]').forEach(el => {
			el.addEventListener('click', () => {
				const i = parseInt(el.dataset.grpMoveUp!);
				state.reorderShapeInGroup(groupId, i, i - 1);
				const group = state.getSelectedGroup();
				if (group) this.renderForm(group);
			});
		});

		this.querySelectorAll<HTMLElement>('[data-grp-move-down]').forEach(el => {
			el.addEventListener('click', () => {
				const i = parseInt(el.dataset.grpMoveDown!);
				state.reorderShapeInGroup(groupId, i, i + 1);
				const group = state.getSelectedGroup();
				if (group) this.renderForm(group);
			});
		});

		this.querySelectorAll<HTMLElement>('[data-grp-remove-shape]').forEach(el => {
			el.addEventListener('click', () => {
				state.removeShapeFromGroup(groupId, el.dataset.grpRemoveShape!);
				const group = state.getSelectedGroup();
				if (group) this.renderForm(group);
				else this.renderList();
			});
		});

		this.querySelector('#grp-add-shape')?.addEventListener('click', () => {
			const select = this.querySelector('#grp-add-shape-select') as HTMLSelectElement;
			if (select?.value) {
				state.addShapeToGroup(groupId, select.value);
				const group = state.getSelectedGroup();
				if (group) this.renderForm(group);
			}
		});

		// Animation
		const getAnimOptions = (): GroupAnimationOptions => ({
			mode: ((this.querySelector('#grp-anim-mode') as HTMLSelectElement)?.value ?? 'none') as GroupAnimationOptions['mode'],
			fadeDuration: parseInt((this.querySelector('#grp-anim-fade') as HTMLInputElement)?.value) || 500,
			holdDuration: parseInt((this.querySelector('#grp-anim-hold') as HTMLInputElement)?.value) || 1000,
			loop: (this.querySelector('#grp-anim-loop') as HTMLInputElement)?.checked ?? true,
			autoPlayResource: (this.querySelector('#grp-anim-autoplay') as HTMLInputElement)?.checked ?? false,
			easing: ((this.querySelector('#grp-anim-easing') as HTMLSelectElement)?.value ?? 'linear') as GroupAnimationOptions['easing'],
			useBpm: (this.querySelector('#grp-anim-bpm') as HTMLInputElement)?.checked ?? false,
		});

		this.querySelector('#grp-anim-mode')?.addEventListener('change', (e) => {
			const mode = (e.target as HTMLSelectElement).value;
			const opts = this.querySelector('#grp-anim-options') as HTMLElement;
			opts?.classList.toggle('hidden', mode === 'none');
			state.setGroupAnimation(groupId, getAnimOptions());
		});

		for (const id of ['grp-anim-fade', 'grp-anim-hold']) {
			this.querySelector(`#${id}`)?.addEventListener('change', () => {
				state.setGroupAnimation(groupId, getAnimOptions());
			});
		}
		this.querySelector('#grp-anim-loop')?.addEventListener('change', () => {
			state.setGroupAnimation(groupId, getAnimOptions());
		});
		this.querySelector('#grp-anim-autoplay')?.addEventListener('change', () => {
			state.setGroupAnimation(groupId, getAnimOptions());
		});
		this.querySelector('#grp-anim-easing')?.addEventListener('change', () => {
			state.setGroupAnimation(groupId, getAnimOptions());
		});
		this.querySelector('#grp-anim-bpm')?.addEventListener('change', (e) => {
			const checked = (e.target as HTMLInputElement).checked;
			const timing = this.querySelector('#grp-anim-timing') as HTMLElement;
			timing?.classList.toggle('hidden', checked);
			state.setGroupAnimation(groupId, getAnimOptions());
		});

		this.querySelector('#grp-anim-play')?.addEventListener('click', async () => {
			const animOpts = getAnimOptions();
			state.setGroupAnimation(groupId, animOpts);
			const group = state.getGroups().get(groupId);
			if (group?.animationPlaying) {
				state.stopGroupAnimation(groupId);
				if (animOpts.useBpm) audioAnalyzer.stop();
			} else {
				if (animOpts.useBpm && !audioAnalyzer.running) {
					await audioAnalyzer.start(state.audioSourceId ?? undefined);
				}
				state.playGroupAnimation(groupId);
			}
			const updatedGroup = state.getSelectedGroup();
			if (updatedGroup) this.renderForm(updatedGroup);
		});

		// Visibility
		this.querySelectorAll<HTMLElement>('[data-grp-toggle-vis]').forEach(el => {
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				const shape = state.getShapes().find(s => s.id === el.dataset.grpToggleVis);
				if (shape) state.updateShape(shape.id, { visible: shape.visible === false ? true : false });
				const group = state.getSelectedGroup();
				if (group) this.renderForm(group);
			});
		});
		this.querySelector('#grp-show-all')?.addEventListener('click', () => {
			state.updateGroupShapes(groupId, { visible: true });
			const group = state.getSelectedGroup();
			if (group) this.renderForm(group);
		});
		this.querySelector('#grp-hide-all')?.addEventListener('click', () => {
			state.updateGroupShapes(groupId, { visible: false });
			const group = state.getSelectedGroup();
			if (group) this.renderForm(group);
		});

		// Playback
		this.querySelector('#grp-play')?.addEventListener('click', () => {
			state.updateGroupShapes(groupId, { playing: true });
		});
		this.querySelector('#grp-pause')?.addEventListener('click', () => {
			state.updateGroupShapes(groupId, { playing: false });
		});

		const fpsSlider = this.querySelector('#grp-fps') as HTMLInputElement;
		const fpsValue = this.querySelector('#grp-fps-value') as HTMLElement;
		fpsSlider?.addEventListener('input', () => {
			fpsValue.textContent = fpsSlider.value;
			this.updating = true;
			state.updateGroupShapes(groupId, { fps: parseInt(fpsSlider.value) });
			this.updating = false;
		});

		this.querySelector('#grp-loop')?.addEventListener('change', (e) => {
			this.updating = true;
			state.updateGroupShapes(groupId, { loop: (e.target as HTMLInputElement).checked });
			this.updating = false;
		});

		// Resource
		this.querySelector('#grp-resource')?.addEventListener('change', (e) => {
			const val = (e.target as HTMLSelectElement).value;
			if (val === '') return;
			this.updating = true;
			state.updateGroupShapes(groupId, { resource: val === '__none__' ? null : val });
			this.updating = false;
		});

		// Projection type
		this.querySelector('#grp-projection')?.addEventListener('change', (e) => {
			const val = (e.target as HTMLSelectElement).value as ProjectionType;
			if (!val) return;

			const isMaskOrMap = val === 'masked' || val === 'mapped';

			if (isMaskOrMap) {
				const grp = state.getGroups().get(groupId);
				const shapes = grp ? grp.shapeIds.map(id => state.getShapes().find(s => s.id === id)).filter(Boolean) : [];
				const allSameResource = shapes.length > 0 && shapes.every(s => s!.resource === shapes[0]!.resource);

				if (!allSameResource) {
					const confirmed = confirm(
						'Switching to masked/mapped will set the same resource on all shapes in this group.\n\n' +
						'Individual shape resources will be replaced. Continue?'
					);
					if (!confirmed) {
						(e.target as HTMLSelectElement).value = 'default';
						return;
					}
				}
			}

			// Get first shape's resource to apply to all
			const group = state.getGroups().get(groupId);
			const firstShape = group ? state.getShapes().find(s => s.id === group.shapeIds[0]) : null;
			const sharedResource = firstShape?.resource ?? null;

			this.updating = true;
			state.updateGroupShapes(groupId, {
				projectionType: val,
				resource: sharedResource,
				resourceOffset: { x: 0, y: 0 },
				resourceScale: 1,
			});
			this.updating = false;

			const updatedGroup = state.getSelectedGroup();
			if (updatedGroup) this.renderForm(updatedGroup);
		});

		// Position modal for masked/mapped
		this.querySelector('#grp-position-modal')?.addEventListener('click', () => {
			const group = state.getGroups().get(groupId);
			if (!group || group.shapeIds.length === 0) return;

			const shapes = state.getShapes();
			const groupShapes = group.shapeIds.map(id => shapes.find(s => s.id === id)).filter(Boolean) as ShapeData[];
			const currentType = groupShapes[0]?.projectionType ?? 'masked';

			// Open modal with all group shapes at their real positions
			const modal = document.querySelector('mask-position-modal') as MaskPositionModal & { showGroup(ids: string[], mode?: 'masked' | 'mapped'): void } | null;
			if (modal) {
				modal.showGroup(group.shapeIds, currentType === 'mapped' ? 'mapped' : 'masked');
			}
		});

		// Effects
		for (const key of ['blur', 'glow', 'colorCorrection', 'distortion', 'glitch'] as const) {
			const slider = this.querySelector(`#grp-fx-${key}`) as HTMLInputElement;
			slider?.addEventListener('input', () => {
				const val = parseInt(slider.value);
				const label = this.querySelector(`#grp-fx-${key}-value`);
				if (label) label.textContent = `${val}%`;
				this.updating = true;
				state.updateGroupEffects(groupId, { [key]: val });
				this.updating = false;
			});
		}
	}
}

customElements.define('group-options-panel', GroupOptionsPanel);
