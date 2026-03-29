export class AppShell extends HTMLElement {
	private timelineHeight = 200;
	private leftWidth = 256;
	private rightWidth = 256;
	private resizing: 'timeline' | 'left' | 'right' | null = null;
	private startX = 0;
	private startY = 0;
	private startSize = 0;

	connectedCallback(): void {
		this.classList.add('hidden');
		this.innerHTML = `
			<div class="h-screen w-screen flex flex-col">
				<controls-panel></controls-panel>
				<div id="main-area" class="flex flex-1 min-h-0" style="padding-bottom: ${this.timelineHeight}px;">
					<resources-panel style="width: ${this.leftWidth}px;"></resources-panel>
					<div id="resize-left" class="w-1 cursor-ew-resize bg-neutral-700 hover:bg-blue-500 transition-colors shrink-0"></div>
					<canvas-panel></canvas-panel>
					<div id="resize-right" class="w-1 cursor-ew-resize bg-neutral-700 hover:bg-blue-500 transition-colors shrink-0"></div>
					<right-panel style="width: ${this.rightWidth}px;"></right-panel>
				</div>
				<div id="timeline-wrapper" class="fixed bottom-0 left-0 right-0 z-30" style="height: ${this.timelineHeight}px;">
					<div id="timeline-resize-handle" class="h-1.5 cursor-ns-resize bg-neutral-700 hover:bg-blue-500 transition-colors"></div>
					<timeline-panel class="h-[calc(100%-6px)]"></timeline-panel>
				</div>
			</div>
			<shortcuts-modal></shortcuts-modal>
			<group-modal></group-modal>
			<text-modal></text-modal>
			<color-modal></color-modal>
			<mask-position-modal></mask-position-modal>
			<midi-test-panel></midi-test-panel>
			<projector-modal></projector-modal>
			<pixabay-modal></pixabay-modal>
		`;

		this.setupResize();
	}

	private setupResize(): void {
		// Timeline vertical resize
		this.querySelector('#timeline-resize-handle')?.addEventListener('mousedown', (e) => {
			this.resizing = 'timeline';
			this.startY = (e as MouseEvent).clientY;
			this.startSize = this.timelineHeight;
			(e as MouseEvent).preventDefault();
		});

		// Left panel horizontal resize
		this.querySelector('#resize-left')?.addEventListener('mousedown', (e) => {
			this.resizing = 'left';
			this.startX = (e as MouseEvent).clientX;
			this.startSize = this.leftWidth;
			(e as MouseEvent).preventDefault();
		});

		// Right panel horizontal resize
		this.querySelector('#resize-right')?.addEventListener('mousedown', (e) => {
			this.resizing = 'right';
			this.startX = (e as MouseEvent).clientX;
			this.startSize = this.rightWidth;
			(e as MouseEvent).preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!this.resizing) return;

			if (this.resizing === 'timeline') {
				const delta = this.startY - e.clientY;
				const maxHeight = Math.floor(window.innerHeight * 0.7);
				this.timelineHeight = Math.max(200, Math.min(maxHeight, this.startSize + delta));
			} else if (this.resizing === 'left') {
				const delta = e.clientX - this.startX;
				this.leftWidth = Math.max(150, Math.min(500, this.startSize + delta));
			} else if (this.resizing === 'right') {
				const delta = this.startX - e.clientX;
				this.rightWidth = Math.max(150, Math.min(500, this.startSize + delta));
			}

			this.updateLayout();
		});

		document.addEventListener('mouseup', () => {
			this.resizing = null;
		});
	}

	toggleTimeline(): void {
		const maxHeight = Math.floor(window.innerHeight * 0.7);
		if (this.timelineHeight >= maxHeight) {
			this.timelineHeight = 200;
		} else {
			this.timelineHeight = maxHeight;
		}
		this.updateLayout();
	}

	private updateLayout(): void {
		const wrapper = this.querySelector('#timeline-wrapper') as HTMLElement;
		const mainArea = this.querySelector('#main-area') as HTMLElement;
		const leftPanel = this.querySelector('resources-panel') as HTMLElement;
		const rightPanel = this.querySelector('right-panel') as HTMLElement;

		if (wrapper) wrapper.style.height = `${this.timelineHeight}px`;
		if (mainArea) mainArea.style.paddingBottom = `${this.timelineHeight}px`;
		if (leftPanel) leftPanel.style.width = `${this.leftWidth}px`;
		if (rightPanel) rightPanel.style.width = `${this.rightWidth}px`;
	}
}

customElements.define('app-shell', AppShell);
