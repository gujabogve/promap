export class AppShell extends HTMLElement {
	private timelineHeight = 200;
	private resizing = false;
	private startY = 0;
	private startHeight = 0;

	connectedCallback(): void {
		this.innerHTML = `
			<div class="h-screen w-screen flex flex-col">
				<controls-panel></controls-panel>
				<div id="main-area" class="flex flex-1 min-h-0" style="padding-bottom: ${this.timelineHeight}px;">
					<resources-panel></resources-panel>
					<canvas-panel></canvas-panel>
					<right-panel></right-panel>
				</div>
				<div id="timeline-wrapper" class="fixed bottom-0 left-0 right-0 z-30" style="height: ${this.timelineHeight}px;">
					<div id="timeline-resize-handle" class="h-1.5 cursor-ns-resize bg-neutral-700 hover:bg-blue-500 transition-colors"></div>
					<timeline-panel class="h-[calc(100%-6px)]"></timeline-panel>
				</div>
				<button id="timeline-toggle" class="fixed left-0 z-40 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded-tr border-t border-r border-neutral-600 text-neutral-400" style="bottom: ${this.timelineHeight}px;">▲ Timeline</button>
			</div>
			<shortcuts-modal></shortcuts-modal>
			<group-modal></group-modal>
			<text-modal></text-modal>
			<color-modal></color-modal>
			<mask-position-modal></mask-position-modal>
		`;

		this.setupResize();
		this.setupToggle();
	}

	private setupResize(): void {
		const handle = this.querySelector('#timeline-resize-handle') as HTMLElement;
		handle.addEventListener('mousedown', (e) => {
			this.resizing = true;
			this.startY = e.clientY;
			this.startHeight = this.timelineHeight;
			e.preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!this.resizing) return;
			const delta = this.startY - e.clientY;
			const maxHeight = Math.floor(window.innerHeight * 0.7);
			this.timelineHeight = Math.max(200, Math.min(maxHeight, this.startHeight + delta));
			this.updateLayout();
		});

		document.addEventListener('mouseup', () => {
			this.resizing = false;
		});
	}

	private setupToggle(): void {
		this.querySelector('#timeline-toggle')?.addEventListener('click', () => {
			const maxHeight = Math.floor(window.innerHeight * 0.7);
			if (this.timelineHeight >= maxHeight) {
				this.timelineHeight = 200;
			} else {
				this.timelineHeight = maxHeight;
			}
			this.updateLayout();
		});
	}

	private updateLayout(): void {
		const wrapper = this.querySelector('#timeline-wrapper') as HTMLElement;
		const toggle = this.querySelector('#timeline-toggle') as HTMLElement;
		const mainArea = this.querySelector('#main-area') as HTMLElement;
		if (!wrapper || !toggle || !mainArea) return;

		wrapper.style.height = `${this.timelineHeight}px`;
		toggle.style.bottom = `${this.timelineHeight}px`;
		mainArea.style.paddingBottom = `${this.timelineHeight}px`;

		const maxHeight = Math.floor(window.innerHeight * 0.7);
		toggle.textContent = this.timelineHeight >= maxHeight ? '▼ Timeline' : '▲ Timeline';
	}
}

customElements.define('app-shell', AppShell);
