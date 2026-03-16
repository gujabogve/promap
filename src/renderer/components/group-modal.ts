import { state } from '../state/state-manager';

export class GroupModal extends HTMLElement {
	private shapeIds: string[] = [];

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
	}

	show(shapeIds: Set<string>): void {
		this.shapeIds = [...shapeIds];
		const shapeNames = this.shapeIds
			.map(id => state.getShapes().find(s => s.id === id)?.name ?? id)
			.join(', ');

		this.innerHTML = `
			<div id="group-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-80 p-5">
				<h2 class="text-sm font-semibold text-neutral-200 mb-3">Create Group</h2>
				<p class="text-xs text-neutral-400 mb-3">Shapes: ${shapeNames}</p>
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Group Name</label>
					<input id="group-name-input" type="text" value="group-${state.getGroups().size + 1}" class="w-full px-2 py-1.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 focus:border-blue-500 outline-none" autofocus>
				</div>
				<div class="flex gap-2">
					<button id="group-cancel" class="flex-1 px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Cancel</button>
					<button id="group-create" class="flex-1 px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">Create</button>
				</div>
			</div>
		`;

		this.classList.remove('hidden');
		this.classList.add('flex');

		const input = this.querySelector('#group-name-input') as HTMLInputElement;
		setTimeout(() => input?.select(), 50);

		this.querySelector('#group-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#group-cancel')?.addEventListener('click', () => this.hide());
		this.querySelector('#group-create')?.addEventListener('click', () => this.create());

		input?.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') this.create();
			if (e.key === 'Escape') this.hide();
		});
	}

	private create(): void {
		const input = this.querySelector('#group-name-input') as HTMLInputElement;
		const name = input?.value.trim();
		if (name && this.shapeIds.length >= 2) {
			state.createGroup(name, this.shapeIds);
		}
		this.hide();
	}

	hide(): void {
		this.classList.remove('flex');
		this.classList.add('hidden');
		this.innerHTML = '';
	}
}

customElements.define('group-modal', GroupModal);
