import { state } from '../state/state-manager';

export class RightPanel extends HTMLElement {
	private activeTab: 'shape' | 'groups' = 'shape';

	connectedCallback(): void {
		this.className = 'block w-64 bg-neutral-900 border-l border-neutral-700 overflow-hidden shrink-0 flex flex-col';
		this.render();
		state.subscribe(() => this.onStateChange());
	}

	private render(): void {
		this.innerHTML = `
			<div class="flex border-b border-neutral-700 shrink-0">
				<button id="tab-shape" class="flex-1 px-3 py-1.5 text-xs font-semibold ${this.activeTab === 'shape' ? 'text-neutral-200 bg-neutral-800 border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}">Shape</button>
				<button id="tab-groups" class="flex-1 px-3 py-1.5 text-xs font-semibold ${this.activeTab === 'groups' ? 'text-neutral-200 bg-neutral-800 border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}">Groups</button>
			</div>
			<div id="tab-content" class="flex-1 overflow-y-auto">
				${this.activeTab === 'shape' ? '<shape-options-panel></shape-options-panel>' : '<group-options-panel></group-options-panel>'}
			</div>
		`;

		this.querySelector('#tab-shape')?.addEventListener('click', () => {
			this.activeTab = 'shape';
			this.render();
		});
		this.querySelector('#tab-groups')?.addEventListener('click', () => {
			this.activeTab = 'groups';
			this.render();
		});
	}

	private onStateChange(): void {
		const group = state.getSelectedGroup();
		const shape = state.getSelectedShape();

		if (group && this.activeTab !== 'groups') {
			this.activeTab = 'groups';
			this.render();
		} else if (shape && !group && this.activeTab !== 'shape') {
			this.activeTab = 'shape';
			this.render();
		}
	}
}

customElements.define('right-panel', RightPanel);
