import { state } from '../state/state-manager';
import { TextOptions } from '../types';
import { canvasManager } from './canvas-panel';

const DEFAULT_TEXT_OPTIONS: TextOptions = {
	text: 'Sample Text',
	fontFamily: 'Arial',
	fontSize: 48,
	bold: false,
	italic: false,
	color: '#ffffff',
	backgroundColor: '#00000000',
	opacity: 100,
	strokeColor: '#000000',
	strokeWidth: 0,
	alignment: 'center',
	padding: 10,
	letterSpacing: 0,
	marquee: false,
	marqueeSpeed: 50,
	marqueeDirection: 'left',
	marqueeLoop: true,
};

const FONTS = [
	'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New',
	'Verdana', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Lucida Console',
];

export class TextModal extends HTMLElement {
	private editingResourceId: string | null = null;

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
	}

	show(existingResourceId?: string): void {
		let opts = { ...DEFAULT_TEXT_OPTIONS };
		this.editingResourceId = existingResourceId ?? null;

		if (existingResourceId) {
			const res = state.getResources().find(r => r.id === existingResourceId);
			if (res?.textOptions) opts = { ...opts, ...res.textOptions };
		}

		this.innerHTML = `
			<div id="text-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto p-5">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-sm font-semibold text-neutral-200">${this.editingResourceId ? 'Edit' : 'Create'} Text Resource</h2>
					<button id="txt-close" class="text-neutral-500 hover:text-neutral-300 text-lg">&times;</button>
				</div>

				<!-- Preview -->
				<div id="txt-preview" class="mb-4 rounded border border-neutral-700 overflow-hidden h-20 flex items-center justify-center" style="background: ${opts.backgroundColor};">
					<span style="${this.previewStyle(opts)}">${opts.text}</span>
				</div>

				<!-- Text -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Text</label>
					<textarea id="txt-text" rows="2" class="w-full px-2 py-1.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 resize-none">${opts.text}</textarea>
				</div>

				<!-- Font + Size -->
				<div class="flex gap-2 mb-3">
					<div class="flex-1">
						<label class="text-xs text-neutral-400 block mb-1">Font</label>
						<select id="txt-font" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							${FONTS.map(f => `<option value="${f}" ${opts.fontFamily === f ? 'selected' : ''}>${f}</option>`).join('')}
						</select>
					</div>
					<div class="w-20">
						<label class="text-xs text-neutral-400 block mb-1">Size</label>
						<input id="txt-size" type="number" value="${opts.fontSize}" min="8" max="500" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					</div>
				</div>

				<!-- Style -->
				<div class="flex gap-2 mb-3">
					<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="txt-bold" type="checkbox" ${opts.bold ? 'checked' : ''} class="accent-blue-500"> Bold</label>
					<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="txt-italic" type="checkbox" ${opts.italic ? 'checked' : ''} class="accent-blue-500"> Italic</label>
					<div class="flex-1"></div>
					<div>
						<label class="text-xs text-neutral-400 block mb-1">Align</label>
						<select id="txt-align" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							<option value="left" ${opts.alignment === 'left' ? 'selected' : ''}>Left</option>
							<option value="center" ${opts.alignment === 'center' ? 'selected' : ''}>Center</option>
							<option value="right" ${opts.alignment === 'right' ? 'selected' : ''}>Right</option>
						</select>
					</div>
				</div>

				<!-- Colors -->
				<div class="flex gap-2 mb-3">
					<div>
						<label class="text-xs text-neutral-400 block mb-1">Color</label>
						<input id="txt-color" type="color" value="${opts.color}" class="w-10 h-7 bg-neutral-800 border border-neutral-600 rounded cursor-pointer">
					</div>
					<div>
						<label class="text-xs text-neutral-400 block mb-1">Background</label>
						<div class="flex items-center gap-1">
							<input id="txt-bg" type="color" value="${opts.backgroundColor.slice(0, 7) || '#000000'}" class="w-10 h-7 bg-neutral-800 border border-neutral-600 rounded cursor-pointer ${opts.backgroundColor === 'transparent' || opts.backgroundColor === '#00000000' ? 'opacity-30' : ''}">
							<label class="text-xs text-neutral-500 flex items-center gap-0.5"><input id="txt-bg-transparent" type="checkbox" ${opts.backgroundColor === 'transparent' || opts.backgroundColor === '#00000000' ? 'checked' : ''} class="accent-blue-500"> None</label>
						</div>
					</div>
					<div>
						<label class="text-xs text-neutral-400 block mb-1">Stroke</label>
						<input id="txt-stroke-color" type="color" value="${opts.strokeColor}" class="w-10 h-7 bg-neutral-800 border border-neutral-600 rounded cursor-pointer">
					</div>
					<div class="w-16">
						<label class="text-xs text-neutral-400 block mb-1">Stroke W</label>
						<input id="txt-stroke-w" type="number" value="${opts.strokeWidth}" min="0" max="20" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					</div>
					<div class="w-16">
						<label class="text-xs text-neutral-400 block mb-1">Opacity</label>
						<input id="txt-opacity" type="number" value="${opts.opacity}" min="0" max="100" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					</div>
				</div>

				<!-- Spacing + Padding -->
				<div class="flex gap-2 mb-3">
					<div class="w-24">
						<label class="text-xs text-neutral-400 block mb-1">Letter Spacing</label>
						<input id="txt-spacing" type="number" value="${opts.letterSpacing}" min="-10" max="50" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					</div>
					<div class="w-24">
						<label class="text-xs text-neutral-400 block mb-1">Padding</label>
						<input id="txt-padding" type="number" value="${opts.padding}" min="0" max="100" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					</div>
				</div>

				<div class="h-px bg-neutral-700 mb-3"></div>

				<!-- Marquee -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 flex items-center gap-1.5 mb-2">
						<input id="txt-marquee" type="checkbox" ${opts.marquee ? 'checked' : ''} class="accent-blue-500"> Marquee / Scroll
					</label>
					<div id="marquee-options" class="${opts.marquee ? '' : 'hidden'} space-y-2">
						<div class="flex gap-2">
							<div class="w-24">
								<label class="text-xs text-neutral-400 block mb-1">Speed</label>
								<input id="txt-marquee-speed" type="number" value="${opts.marqueeSpeed}" min="1" max="500" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
							</div>
							<div>
								<label class="text-xs text-neutral-400 block mb-1">Direction</label>
								<select id="txt-marquee-dir" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
									<option value="left" ${opts.marqueeDirection === 'left' ? 'selected' : ''}>Left</option>
									<option value="right" ${opts.marqueeDirection === 'right' ? 'selected' : ''}>Right</option>
									<option value="up" ${opts.marqueeDirection === 'up' ? 'selected' : ''}>Up</option>
									<option value="down" ${opts.marqueeDirection === 'down' ? 'selected' : ''}>Down</option>
								</select>
							</div>
						</div>
						<label class="text-xs text-neutral-400 flex items-center gap-1.5">
							<input id="txt-marquee-loop" type="checkbox" ${opts.marqueeLoop ? 'checked' : ''} class="accent-blue-500"> Loop
						</label>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex gap-2">
					<button id="txt-cancel" class="flex-1 px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Cancel</button>
					<button id="txt-save" class="flex-1 px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">${this.editingResourceId ? 'Update' : 'Create'}</button>
				</div>
			</div>
		`;

		this.classList.remove('hidden');
		this.classList.add('flex');

		this.querySelector('#text-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#txt-close')?.addEventListener('click', () => this.hide());
		this.querySelector('#txt-cancel')?.addEventListener('click', () => this.hide());
		this.querySelector('#txt-save')?.addEventListener('click', () => this.save());

		this.querySelector('#txt-marquee')?.addEventListener('change', (e) => {
			const opts = this.querySelector('#marquee-options') as HTMLElement;
			opts?.classList.toggle('hidden', !(e.target as HTMLInputElement).checked);
		});

		this.querySelector('#txt-bg-transparent')?.addEventListener('change', (e) => {
			const bgInput = this.querySelector('#txt-bg') as HTMLElement;
			bgInput?.classList.toggle('opacity-30', (e.target as HTMLInputElement).checked);
			this.updatePreview();
		});

		// Live preview
		const previewInputs = ['txt-text', 'txt-font', 'txt-size', 'txt-bold', 'txt-italic',
			'txt-color', 'txt-bg', 'txt-stroke-color', 'txt-stroke-w', 'txt-opacity',
			'txt-spacing', 'txt-padding', 'txt-align'];
		for (const id of previewInputs) {
			this.querySelector(`#${id}`)?.addEventListener('input', () => this.updatePreview());
		}
	}

	private getFormOptions(): TextOptions {
		return {
			text: (this.querySelector('#txt-text') as HTMLTextAreaElement).value,
			fontFamily: (this.querySelector('#txt-font') as HTMLSelectElement).value,
			fontSize: parseInt((this.querySelector('#txt-size') as HTMLInputElement).value),
			bold: (this.querySelector('#txt-bold') as HTMLInputElement).checked,
			italic: (this.querySelector('#txt-italic') as HTMLInputElement).checked,
			color: (this.querySelector('#txt-color') as HTMLInputElement).value,
			backgroundColor: (this.querySelector('#txt-bg-transparent') as HTMLInputElement).checked ? 'transparent' : (this.querySelector('#txt-bg') as HTMLInputElement).value,
			opacity: parseInt((this.querySelector('#txt-opacity') as HTMLInputElement).value),
			strokeColor: (this.querySelector('#txt-stroke-color') as HTMLInputElement).value,
			strokeWidth: parseInt((this.querySelector('#txt-stroke-w') as HTMLInputElement).value),
			alignment: (this.querySelector('#txt-align') as HTMLSelectElement).value as TextOptions['alignment'],
			padding: parseInt((this.querySelector('#txt-padding') as HTMLInputElement).value),
			letterSpacing: parseInt((this.querySelector('#txt-spacing') as HTMLInputElement).value),
			marquee: (this.querySelector('#txt-marquee') as HTMLInputElement).checked,
			marqueeSpeed: parseInt((this.querySelector('#txt-marquee-speed') as HTMLInputElement).value),
			marqueeDirection: (this.querySelector('#txt-marquee-dir') as HTMLSelectElement).value as TextOptions['marqueeDirection'],
			marqueeLoop: (this.querySelector('#txt-marquee-loop') as HTMLInputElement).checked,
		};
	}

	private previewStyle(opts: TextOptions): string {
		return `
			font-family: ${opts.fontFamily};
			font-size: ${Math.min(opts.fontSize, 32)}px;
			font-weight: ${opts.bold ? 'bold' : 'normal'};
			font-style: ${opts.italic ? 'italic' : 'normal'};
			color: ${opts.color};
			opacity: ${opts.opacity / 100};
			letter-spacing: ${opts.letterSpacing}px;
			text-align: ${opts.alignment};
			padding: ${opts.padding}px;
			${opts.strokeWidth > 0 ? `-webkit-text-stroke: ${opts.strokeWidth}px ${opts.strokeColor};` : ''}
		`.trim();
	}

	private updatePreview(): void {
		const opts = this.getFormOptions();
		const preview = this.querySelector('#txt-preview') as HTMLElement;
		if (!preview) return;
		preview.style.background = opts.backgroundColor;
		const span = preview.querySelector('span') as HTMLElement;
		if (span) {
			span.textContent = opts.text;
			span.setAttribute('style', this.previewStyle(opts));
		}
	}

	private generateTextCanvas(opts: TextOptions): string {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;

		const fontStyle = `${opts.italic ? 'italic ' : ''}${opts.bold ? 'bold ' : ''}${opts.fontSize}px ${opts.fontFamily}`;
		ctx.font = fontStyle;

		const metrics = ctx.measureText(opts.text);
		const textWidth = metrics.width + opts.padding * 2 + opts.strokeWidth * 2;
		const textHeight = opts.fontSize * 1.3 + opts.padding * 2 + opts.strokeWidth * 2;

		canvas.width = Math.ceil(textWidth);
		canvas.height = Math.ceil(textHeight);

		// Background
		if (opts.backgroundColor && opts.backgroundColor !== '#00000000') {
			ctx.fillStyle = opts.backgroundColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		ctx.font = fontStyle;
		ctx.textBaseline = 'middle';

		let x = opts.padding + opts.strokeWidth;
		if (opts.alignment === 'center') {
			ctx.textAlign = 'center';
			x = canvas.width / 2;
		} else if (opts.alignment === 'right') {
			ctx.textAlign = 'right';
			x = canvas.width - opts.padding - opts.strokeWidth;
		}
		const y = canvas.height / 2;

		// Apply letter spacing via manual character rendering if needed
		ctx.globalAlpha = opts.opacity / 100;

		if (opts.strokeWidth > 0) {
			ctx.strokeStyle = opts.strokeColor;
			ctx.lineWidth = opts.strokeWidth;
			ctx.strokeText(opts.text, x, y);
		}

		ctx.fillStyle = opts.color;
		ctx.fillText(opts.text, x, y);

		return canvas.toDataURL('image/png');
	}

	private save(): void {
		const opts = this.getFormOptions();
		const src = this.generateTextCanvas(opts);
		const name = opts.text.slice(0, 20) || 'text';

		if (this.editingResourceId) {
			if (canvasManager) canvasManager.clearResourceCache(this.editingResourceId);
			state.updateResource(this.editingResourceId, { name, src, thumbnail: src, textOptions: opts });
		} else {
			state.addResource({
				name,
				type: 'text',
				src,
				thumbnail: src,
				textOptions: opts,
			});
		}

		this.hide();
	}

	hide(): void {
		this.classList.remove('flex');
		this.classList.add('hidden');
		this.innerHTML = '';
		this.editingResourceId = null;
	}
}

customElements.define('text-modal', TextModal);
