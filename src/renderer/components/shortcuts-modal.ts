export class ShortcutsModal extends HTMLElement {
	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
		this.innerHTML = `
			<div id="shortcuts-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto p-5">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-sm font-semibold text-neutral-200">Keyboard Shortcuts</h2>
					<button id="shortcuts-close" class="text-neutral-500 hover:text-neutral-300 text-lg">&times;</button>
				</div>

				<div class="space-y-3">
					${this.section('General', [
						['Ctrl + Z', 'Undo'],
						['Ctrl + Shift + Z', 'Redo'],
						['Ctrl + Y', 'Redo'],
						['Delete / Backspace', 'Delete selected shape'],
						['Ctrl + S', 'Save project'],
						['Ctrl + O', 'Load project'],
						['?', 'Toggle this cheat sheet'],
					])}

					${this.section('Canvas', [
						['Click shape', 'Select shape'],
						['Drag shape', 'Move shape'],
						['Drag point', 'Move individual point'],
						['Click empty area', 'Deselect'],
						['Ctrl + Click', 'Multi-select (no group)'],
						['Shift + Click', 'Select for grouping'],
						['Alt + Drag', 'Lock circle resize ratio'],
					])}

					${this.section('Playback', [
						['Space', 'Play / Pause all'],
					])}
				</div>
			</div>
		`;

		this.querySelector('#shortcuts-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#shortcuts-close')?.addEventListener('click', () => this.hide());
	}

	private section(title: string, shortcuts: string[][]): string {
		return `
			<div>
				<h3 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">${title}</h3>
				<div class="space-y-1">
					${shortcuts.map(([key, desc]) => `
						<div class="flex items-center justify-between py-0.5">
							<span class="text-xs text-neutral-400">${desc}</span>
							<kbd class="text-xs bg-neutral-800 border border-neutral-600 rounded px-1.5 py-0.5 text-neutral-300 font-mono">${key}</kbd>
						</div>
					`).join('')}
				</div>
			</div>
		`;
	}

	show(): void {
		this.classList.remove('hidden');
		this.classList.add('flex');
	}

	hide(): void {
		this.classList.remove('flex');
		this.classList.add('hidden');
	}

	toggle(): void {
		if (this.classList.contains('hidden')) {
			this.show();
		} else {
			this.hide();
		}
	}
}

customElements.define('shortcuts-modal', ShortcutsModal);
