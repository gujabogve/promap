import { state } from '../state/state-manager';

export class ProjectorModal extends HTMLElement {
	private activeTab: number | null = null;

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
	}

	show(): void {
		const projectors = [...state.openProjectors];
		if (projectors.length > 0 && !this.activeTab) {
			this.activeTab = projectors[0];
		}
		this.renderModal();
		this.classList.remove('hidden');
		this.classList.add('flex');
	}

	private renderModal(): void {
		const projectors = [...state.openProjectors].sort();

		this.innerHTML = `
			<div id="proj-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl flex flex-col" style="width: 500px; max-height: 80vh;">

				<!-- Tabs -->
				<div class="flex items-center border-b border-neutral-700 shrink-0">
					${projectors.map(id => `
						<div class="flex items-center ${this.activeTab === id ? 'bg-neutral-800 border-b-2 border-blue-500' : 'hover:bg-neutral-800'} cursor-pointer">
							<button class="px-4 py-2 text-xs font-semibold ${this.activeTab === id ? 'text-neutral-200' : 'text-neutral-500'}" data-proj-tab="${id}">P${id}</button>
							<button class="px-1 py-2 text-xs text-neutral-600 hover:text-red-400" data-proj-close="${id}" title="Close projector">&times;</button>
						</div>
					`).join('')}
					<button id="proj-add" class="px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800" title="Add projector">+</button>
					<div class="flex-1"></div>
					<button id="proj-modal-close" class="px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300">&times;</button>
				</div>

				<!-- Tab body -->
				<div class="flex-1 overflow-y-auto p-5">
					${this.activeTab && state.openProjectors.has(this.activeTab) ? this.renderTabContent(this.activeTab) : this.renderEmpty()}
				</div>
			</div>
		`;

		this.setupListeners();
	}

	private renderEmpty(): string {
		return `
			<div class="text-xs text-neutral-500 text-center py-8">
				No projectors open<br>
				<span class="text-neutral-600">Click + to add one</span>
			</div>
		`;
	}

	private renderTabContent(projectorId: number): string {
		const opts = state.projectorDisplayOptions.get(projectorId) ?? { showOutline: false, showPoints: false, showGrid: false };

		// Count shapes assigned to this projector
		const assignedShapes = state.getShapes().filter(s => s.projector === projectorId);

		return `
			<div class="space-y-4">
				<div>
					<h3 class="text-sm font-semibold text-neutral-200 mb-1">Projector ${projectorId}</h3>
					<p class="text-xs text-neutral-500">${assignedShapes.length} shape${assignedShapes.length !== 1 ? 's' : ''} assigned</p>
				</div>

				<!-- Display options -->
				<div>
					<label class="text-xs text-neutral-400 block mb-2">Display Options</label>
					<div class="space-y-1.5">
						<label class="text-xs text-neutral-300 flex items-center gap-2">
							<input type="checkbox" data-proj-opt="showOutline" ${opts.showOutline ? 'checked' : ''} class="accent-blue-500"> Show outline
						</label>
						<label class="text-xs text-neutral-300 flex items-center gap-2">
							<input type="checkbox" data-proj-opt="showPoints" ${opts.showPoints ? 'checked' : ''} class="accent-blue-500"> Show points
						</label>
						<label class="text-xs text-neutral-300 flex items-center gap-2">
							<input type="checkbox" data-proj-opt="showGrid" ${opts.showGrid ? 'checked' : ''} class="accent-blue-500"> Show grid
						</label>
						<label class="text-xs text-neutral-300 flex items-center gap-2">
							<input type="checkbox" data-proj-opt="showFace" ${opts.showFace ? 'checked' : ''} class="accent-blue-500"> Show face (white fill)
						</label>
					</div>
				</div>

				<!-- Assigned shapes list -->
				<div>
					<label class="text-xs text-neutral-400 block mb-2">Assigned Shapes</label>
					${assignedShapes.length === 0 ? `
						<div class="text-xs text-neutral-600 text-center py-3">No shapes assigned to this projector.<br>Set projector in shape options.</div>
					` : `
						<div class="space-y-1 max-h-40 overflow-y-auto">
							${assignedShapes.map(s => `
								<div class="flex items-center gap-2 px-2 py-1 rounded bg-neutral-800 text-xs text-neutral-300">
									<span class="text-neutral-400">${s.type === 'circle' ? '●' : s.type === 'triangle' ? '▲' : s.type === 'square' ? '■' : '⬡'}</span>
									<span class="truncate flex-1">${s.name}</span>
									<span class="text-neutral-500">${s.visible === false ? '◇' : '◆'}</span>
								</div>
							`).join('')}
						</div>
					`}
				</div>

				<!-- Quick assign -->
				<div>
					<label class="text-xs text-neutral-400 block mb-2">Quick Assign</label>
					<div class="flex gap-1.5">
						<select id="proj-assign-shape" class="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							<option value="">Select shape...</option>
							${state.getShapes().filter(s => s.projector !== projectorId).map(s => `<option value="${s.id}">${s.name} (P${s.projector})</option>`).join('')}
						</select>
						<button id="proj-assign-btn" class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">Assign</button>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex gap-1.5 pt-2 border-t border-neutral-700">
					<button id="proj-assign-all" class="flex-1 px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Assign all shapes here</button>
					<button id="proj-close-btn" class="px-3 py-1 text-xs bg-red-900 hover:bg-red-800 rounded border border-red-700 text-red-300">Close Projector</button>
				</div>
			</div>
		`;
	}

	private setupListeners(): void {
		this.querySelector('#proj-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#proj-modal-close')?.addEventListener('click', () => this.hide());

		// Tab clicks
		this.querySelectorAll<HTMLElement>('[data-proj-tab]').forEach(el => {
			el.addEventListener('click', () => {
				this.activeTab = parseInt(el.dataset.projTab!);
				this.renderModal();
			});
		});

		// Close projector from tab
		this.querySelectorAll<HTMLElement>('[data-proj-close]').forEach(el => {
			el.addEventListener('click', async (e) => {
				e.stopPropagation();
				const id = parseInt(el.dataset.projClose!);
				await state.closeExternalWindow(id);
				if (this.activeTab === id) {
					const remaining = [...state.openProjectors];
					this.activeTab = remaining.length > 0 ? remaining[0] : null;
				}
				this.renderModal();
			});
		});

		// Add projector
		this.querySelector('#proj-add')?.addEventListener('click', async () => {
			const nextId = Math.max(0, ...[...state.openProjectors]) + 1;
			await state.openExternalWindow(nextId);
			this.activeTab = nextId;
			this.renderModal();
		});

		// Display option toggles
		this.querySelectorAll<HTMLInputElement>('[data-proj-opt]').forEach(el => {
			el.addEventListener('change', () => {
				if (!this.activeTab) return;
				const key = el.dataset.projOpt as 'showOutline' | 'showPoints' | 'showGrid';
				const opts = state.projectorDisplayOptions.get(this.activeTab) ?? { showOutline: false, showPoints: false, showGrid: false };
				opts[key] = el.checked;
				state.projectorDisplayOptions.set(this.activeTab, opts);
				state.syncExternal();
			});
		});

		// Quick assign
		this.querySelector('#proj-assign-btn')?.addEventListener('click', () => {
			const select = this.querySelector('#proj-assign-shape') as HTMLSelectElement;
			if (select?.value && this.activeTab) {
				state.updateShape(select.value, { projector: this.activeTab });
				this.renderModal();
			}
		});

		// Assign all
		this.querySelector('#proj-assign-all')?.addEventListener('click', () => {
			if (!this.activeTab) return;
			state.getShapes().forEach(s => {
				state.updateShape(s.id, { projector: this.activeTab! });
			});
			this.renderModal();
		});

		// Close projector button
		this.querySelector('#proj-close-btn')?.addEventListener('click', async () => {
			if (!this.activeTab) return;
			await state.closeExternalWindow(this.activeTab);
			const remaining = [...state.openProjectors];
			this.activeTab = remaining.length > 0 ? remaining[0] : null;
			this.renderModal();
		});
	}

	hide(): void {
		this.classList.remove('flex');
		this.classList.add('hidden');
		this.innerHTML = '';
	}
}

customElements.define('projector-modal', ProjectorModal);
