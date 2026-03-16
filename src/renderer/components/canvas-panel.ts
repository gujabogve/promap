import { Application } from 'pixi.js';
import { CanvasManager } from '../canvas/canvas-manager';

export let canvasManager: CanvasManager | null = null;

export class CanvasPanel extends HTMLElement {
	private app: Application | null = null;

	async connectedCallback(): Promise<void> {
		this.className = 'block flex-1 bg-neutral-950 relative overflow-hidden min-w-0';

		const container = document.createElement('div');
		container.className = 'w-full h-full';
		this.appendChild(container);

		this.app = new Application();
		await this.app.init({
			resizeTo: container,
			background: 0x0d0d0d,
			antialias: true,
		});
		container.appendChild(this.app.canvas);

		canvasManager = new CanvasManager(this.app);

		this.createToolbar();
	}

	private createToolbar(): void {
		const toolbar = document.createElement('div');
		toolbar.className = 'absolute top-2 right-2 flex gap-1 z-10';
		toolbar.innerHTML = `
			<button id="cv-zoom-in" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Zoom in">+</button>
			<button id="cv-zoom-out" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Zoom out">−</button>
			<button id="cv-zoom-reset" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300 font-semibold" title="Reset view">R</button>
			<button id="cv-drag-mode" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Drag/pan mode">✋</button>
		`;
		this.appendChild(toolbar);

		toolbar.querySelector('#cv-zoom-in')?.addEventListener('click', () => {
			canvasManager?.zoomBy(1.2);
		});
		toolbar.querySelector('#cv-zoom-out')?.addEventListener('click', () => {
			canvasManager?.zoomBy(0.8);
		});
		toolbar.querySelector('#cv-zoom-reset')?.addEventListener('click', () => {
			canvasManager?.resetView();
		});

		const dragBtn = toolbar.querySelector('#cv-drag-mode') as HTMLElement;
		dragBtn?.addEventListener('click', () => {
			if (!canvasManager) return;
			canvasManager.panMode = !canvasManager.panMode;
			dragBtn.classList.toggle('bg-blue-700/80', canvasManager.panMode);
			dragBtn.classList.toggle('border-blue-600', canvasManager.panMode);
			dragBtn.classList.toggle('text-blue-100', canvasManager.panMode);
			dragBtn.classList.toggle('bg-neutral-800/80', !canvasManager.panMode);
			dragBtn.classList.toggle('border-neutral-600', !canvasManager.panMode);
			dragBtn.classList.toggle('text-neutral-300', !canvasManager.panMode);
		});
	}
}

customElements.define('canvas-panel', CanvasPanel);
