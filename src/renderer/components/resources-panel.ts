import { state } from '../state/state-manager';
import { ResourceData } from '../types';
import { TextModal } from './text-modal';
import { ColorModal } from './color-modal';

export class ResourcesPanel extends HTMLElement {
	connectedCallback(): void {
		this.className = 'block w-64 bg-neutral-900 border-r border-neutral-700 shrink-0';
		this.renderPanel();
		this.setupListeners();
		state.subscribe(() => this.renderList());
	}

	private renderPanel(): void {
		this.innerHTML = `
			<div class="flex flex-col h-full">
				<div class="p-3 border-b border-neutral-700">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Resources</h2>
					<div class="flex gap-1.5">
						<button id="btn-add-media" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Media</button>
						<button id="btn-add-text" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Text</button>
						<button id="btn-add-color" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Color</button>
					</div>
				</div>
				<div id="resources-list" class="flex-1 overflow-y-auto p-3">
					<div class="text-xs text-neutral-500 text-center py-8">No resources</div>
				</div>
			</div>
		`;
	}

	private setupListeners(): void {
		this.querySelector('#btn-add-media')?.addEventListener('click', () => this.addMedia());
		this.querySelector('#btn-add-text')?.addEventListener('click', () => this.addText());
		this.querySelector('#btn-add-color')?.addEventListener('click', () => this.addColor());
	}

	private async addMedia(): Promise<void> {
		const files = await window.promap.uploadMedia();
		for (const file of files) {
			const src = `media://${file.filename}`;
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
	}

	private renderItem(r: ResourceData): string {
		const thumbSrc = r.thumbnail || r.src;
		const hasThumb = thumbSrc && thumbSrc.length > 0;

		return `
			<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 cursor-grab mb-1 group" draggable="true" data-resource-id="${r.id}">
				${hasThumb
					? `<img src="${thumbSrc}" draggable="false" class="w-10 h-7 object-cover rounded border border-neutral-700 shrink-0 pointer-events-none" alt="">`
					: `<div class="w-10 h-7 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">T</div>`
				}
				<span class="text-xs text-neutral-300 truncate flex-1">${r.name}</span>
				<button data-remove="${r.id}" class="text-xs text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100">✕</button>
			</div>
		`;
	}
}

customElements.define('resources-panel', ResourcesPanel);
