import { state } from '../state/state-manager';

export class ProjectScreen extends HTMLElement {
	connectedCallback(): void {
		this.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950';
		this.render();
	}

	async render(): Promise<void> {
		const recent = await window.promap.getRecentProjects();
		const projects = await window.promap.getProjects();

		// Build recent list with modification times
		const recentWithInfo = recent
			.map(name => {
				const info = projects.find(p => p.name === name);
				return info ? { name, modifiedAt: info.modifiedAt } : null;
			})
			.filter(Boolean) as { name: string; modifiedAt: number }[];

		this.innerHTML = `
			<div class="w-full max-w-md mx-auto p-8">
				<div class="text-center mb-8">
					<h1 class="text-2xl font-bold text-neutral-100 mb-1">ProMap</h1>
					<p class="text-xs text-neutral-500">Projection Mapping Tool</p>
				</div>

				<div class="flex gap-2 mb-6">
					<button id="ps-new" class="flex-1 px-4 py-2.5 text-sm bg-cyan-800 hover:bg-cyan-700 rounded border border-cyan-700 text-cyan-100 font-semibold">+ New Project</button>
					<button id="ps-import" class="flex-1 px-4 py-2.5 text-sm bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Import</button>
				</div>

				${recentWithInfo.length > 0 ? `
					<div class="mb-2">
						<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Recent Projects</h2>
						<div class="space-y-1">
							${recentWithInfo.map(p => `
								<div class="flex items-center gap-2 px-3 py-2.5 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 cursor-pointer group" data-open-project="${p.name}">
									<div class="flex-1 min-w-0">
										<div class="text-sm text-neutral-200 truncate">${p.name}</div>
										<div class="text-xs text-neutral-500">${this.formatDate(p.modifiedAt)}</div>
									</div>
									<button data-delete-project="${p.name}" class="text-xs text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 px-1" title="Delete">✕</button>
								</div>
							`).join('')}
						</div>
					</div>
				` : `
					<div class="text-center py-8 text-neutral-600 text-sm">No recent projects</div>
				`}
			</div>
		`;

		this.setupListeners();
	}

	private setupListeners(): void {
		this.querySelector('#ps-new')?.addEventListener('click', () => {
			const btn = this.querySelector('#ps-new') as HTMLElement;
			const wrapper = btn.parentElement!;
			wrapper.innerHTML = `
				<input id="ps-name-input" type="text" placeholder="Project name..." autofocus class="flex-1 px-3 py-2 text-sm bg-neutral-800 border border-cyan-600 rounded text-neutral-100 outline-none">
				<button id="ps-name-ok" class="px-4 py-2 text-sm bg-cyan-800 hover:bg-cyan-700 rounded border border-cyan-700 text-cyan-100 font-semibold">Create</button>
				<button id="ps-name-cancel" class="px-3 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-400">Cancel</button>
			`;
			const input = this.querySelector('#ps-name-input') as HTMLInputElement;
			input.focus();

			const create = async () => {
				const name = input.value.trim();
				if (!name) return;
				await window.promap.createProject(name);
				state.loadFromJson('{}');
				this.enterEditor();
			};

			this.querySelector('#ps-name-ok')?.addEventListener('click', create);
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') create();
				if (e.key === 'Escape') this.render();
			});
			this.querySelector('#ps-name-cancel')?.addEventListener('click', () => this.render());
		});

		this.querySelector('#ps-import')?.addEventListener('click', async () => {
			const json = await window.promap.importProject();
			if (!json) return;
			state.loadFromJson(json);
			this.enterEditor();
		});

		this.querySelectorAll<HTMLElement>('[data-open-project]').forEach(el => {
			el.addEventListener('click', async (e) => {
				if ((e.target as HTMLElement).dataset.deleteProject) return;
				const name = el.dataset.openProject!;
				const json = await window.promap.openProject(name);
				if (json) {
					state.loadFromJson(json);
					this.enterEditor();
				}
			});
		});

		this.querySelectorAll<HTMLElement>('[data-delete-project]').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const name = btn.dataset.deleteProject!;
				if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
				await window.promap.deleteProject(name);
				this.render();
			});
		});
	}

	private enterEditor(): void {
		this.classList.add('hidden');
		const shell = document.querySelector('app-shell');
		if (shell) (shell as HTMLElement).classList.remove('hidden');
	}

	show(): void {
		this.classList.remove('hidden');
		const shell = document.querySelector('app-shell');
		if (shell) (shell as HTMLElement).classList.add('hidden');
		this.render();
	}

	private formatDate(ms: number): string {
		const diff = Date.now() - ms;
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'Just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		const weeks = Math.floor(days / 7);
		if (weeks < 4) return `${weeks}w ago`;
		return new Date(ms).toLocaleDateString();
	}
}

customElements.define('project-screen', ProjectScreen);
