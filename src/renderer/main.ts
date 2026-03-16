import './types/promap-api';
import './components/app-shell';
import './components/controls-panel';
import './components/resources-panel';
import './components/canvas-panel';
import './components/shape-options-panel';
import './components/timeline-panel';
import './components/shortcuts-modal';
import './components/group-modal';
import './components/text-modal';
import './components/color-modal';
import './components/right-panel';
import './components/group-options-panel';
import './components/mask-position-modal';
import { state } from './state/state-manager';
import { ShortcutsModal } from './components/shortcuts-modal';

function isInputFocused(): boolean {
	const active = document.activeElement;
	return !!active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
}

function getShortcutsModal(): ShortcutsModal | null {
	return document.querySelector('shortcuts-modal');
}

document.addEventListener('keydown', (e) => {
	const key = e.key.toLowerCase();

	if (e.ctrlKey && key === 'z' && !e.shiftKey) {
		e.preventDefault();
		state.undo();
	} else if (e.ctrlKey && key === 'z' && e.shiftKey) {
		e.preventDefault();
		state.redo();
	} else if (e.ctrlKey && key === 'y') {
		e.preventDefault();
		state.redo();
	} else if (e.ctrlKey && key === 's') {
		e.preventDefault();
		state.save();
	} else if (e.ctrlKey && key === 'o') {
		e.preventDefault();
		state.load();
	} else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
		if (!isInputFocused()) {
			e.preventDefault();
			getShortcutsModal()?.toggle();
		}
	} else if (e.key === 'Escape') {
		getShortcutsModal()?.hide();
	} else if (e.key === ' ') {
		if (!isInputFocused()) {
			e.preventDefault();
			const shapes = state.getShapes();
			const anyPlaying = shapes.some(s => !s.ignoreGlobalPlayPause && s.playing);
			shapes.forEach(s => {
				if (!s.ignoreGlobalPlayPause) {
					state.updateShape(s.id, { playing: !anyPlaying });
				}
			});
		}
	} else if (e.key === 'Delete' || e.key === 'Backspace') {
		if (!isInputFocused()) {
			const selected = state.getSelectedShape();
			if (selected) state.deleteShape(selected.id);
		}
	}
});
