import { state } from '../state/state-manager';

const DEFAULT_API_KEY = '55060218-9249016aa07ef1e2dead6ee5a';
const API_KEY_STORAGE = 'promap-pixabay-api-key';
const API_URL = 'https://pixabay.com/api/videos/';
const CACHE_KEY = 'promap-pixabay-cache';

function getApiKey(): string {
	return localStorage.getItem(API_KEY_STORAGE) || DEFAULT_API_KEY;
}
function setApiKey(key: string): void {
	if (key && key !== DEFAULT_API_KEY) {
		localStorage.setItem(API_KEY_STORAGE, key);
	} else {
		localStorage.removeItem(API_KEY_STORAGE);
	}
}

interface PixabayVideo {
	id: number;
	pageURL: string;
	tags: string;
	duration: number;
	views: number;
	downloads: number;
	likes: number;
	user: string;
	videos: {
		large: { url: string; width: number; height: number };
		medium: { url: string; width: number; height: number };
		small: { url: string; width: number; height: number };
		tiny: { url: string; width: number; height: number; thumbnail: string };
	};
}

interface PixabayImage {
	id: number;
	pageURL: string;
	tags: string;
	views: number;
	downloads: number;
	likes: number;
	user: string;
	previewURL: string;
	largeImageURL: string;
	vectorURL?: string;
	imageWidth: number;
	imageHeight: number;
}

interface CachedVideo {
	id: number;
	filename: string;
	name: string;
	thumbnail: string;
	user: string;
	pageURL: string;
}

interface CachedVector {
	id: number;
	filename: string;
	name: string;
	thumbnail: string;
	user: string;
	pageURL: string;
	isSvg?: boolean;
	svgData?: string;
}

const VECTOR_CACHE_KEY = 'promap-pixabay-vectors';

export class PixabayModal extends HTMLElement {
	private searchTab: 'videos' | 'vectors' = 'videos';
	private results: PixabayVideo[] = [];
	private vectorResults: PixabayImage[] = [];
	private page = 1;
	private totalHits = 0;
	private loading = false;
	private downloading: Set<number> = new Set();
	private cachedVideos: Map<number, CachedVideo> = new Map();
	private cachedVectors: Map<number, CachedVector> = new Map();

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
		this.loadCache();
	}

	private loadCache(): void {
		try {
			const data = localStorage.getItem(CACHE_KEY);
			if (data) {
				const entries: CachedVideo[] = JSON.parse(data);
				entries.forEach(v => this.cachedVideos.set(v.id, v));
			}
			const vData = localStorage.getItem(VECTOR_CACHE_KEY);
			if (vData) {
				const entries: CachedVector[] = JSON.parse(vData);
				entries.forEach(v => this.cachedVectors.set(v.id, v));
			}
		} catch { /* ignore */ }
	}

	private saveCache(): void {
		localStorage.setItem(CACHE_KEY, JSON.stringify([...this.cachedVideos.values()]));
		localStorage.setItem(VECTOR_CACHE_KEY, JSON.stringify([...this.cachedVectors.values()]));
	}

	show(): void {
		this.renderModal();
		this.classList.remove('hidden');
		this.classList.add('flex');
	}

	private renderModal(): void {
		this.innerHTML = `
			<div id="px-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl flex flex-col" style="width: calc(100vw - 100px); height: calc(100vh - 80px);">
				<div class="flex items-center justify-between px-5 py-3 border-b border-neutral-700 shrink-0">
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-semibold text-neutral-200">Download</h2>
						<div class="flex gap-0.5 bg-neutral-800 rounded p-0.5">
							<button data-px-tab="videos" class="px-2 py-0.5 text-xs rounded ${this.searchTab === 'videos' ? 'bg-neutral-700 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'}">Videos</button>
							<button data-px-tab="vectors" class="px-2 py-0.5 text-xs rounded ${this.searchTab === 'vectors' ? 'bg-neutral-700 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'}">Vectors</button>
						</div>
						<span class="text-xs text-neutral-500">Powered by</span>
						<span class="text-xs text-green-400 font-semibold">Pixabay</span>
						<span class="text-xs text-neutral-600">— Free for commercial use</span>
					</div>
					<div class="flex items-center gap-2">
						<div class="flex items-center gap-1">
							<span class="text-xs text-neutral-500">API Key:</span>
							<input id="px-api-key" type="password" value="${getApiKey()}" class="w-32 px-2 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 font-mono" spellcheck="false">
							<button id="px-key-toggle" class="text-xs text-neutral-500 hover:text-neutral-300" title="Show/hide key">👁</button>
						</div>
						<button id="px-close" class="text-neutral-500 hover:text-neutral-300 text-lg">&times;</button>
					</div>
				</div>

				<!-- Search bar -->
				<div class="flex gap-2 px-5 py-3 border-b border-neutral-700 shrink-0">
					<input id="px-search" type="text" placeholder="Search ${this.searchTab}..." class="flex-1 px-3 py-1.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300" value="">
					<select id="px-order" class="px-2 py-1.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						<option value="popular">Popular</option>
						<option value="latest">Latest</option>
					</select>
					${this.searchTab === 'videos' ? `
					<select id="px-quality" class="px-2 py-1.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						<option value="medium">Medium (1080p)</option>
						<option value="small">Small (720p)</option>
						<option value="large">Large (4K)</option>
						<option value="tiny">Tiny (540p)</option>
					</select>
					` : ''}
					<button id="px-search-btn" class="px-4 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">Search</button>
				</div>

				<!-- Results grid -->
				<div id="px-results" class="flex-1 overflow-y-auto p-5">
					<div class="text-xs text-neutral-500 text-center py-12">Search for videos to get started</div>
				</div>

				<!-- Pagination -->
				<div id="px-pagination" class="flex items-center justify-between px-5 py-2 border-t border-neutral-700 shrink-0">
					<span id="px-info" class="text-xs text-neutral-500"></span>
					<div class="flex gap-1.5">
						<button id="px-prev" class="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300 disabled:opacity-30" disabled>← Prev</button>
						<button id="px-next" class="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300 disabled:opacity-30" disabled>Next →</button>
					</div>
				</div>
			</div>
		`;

		this.setupListeners();
	}

	private setupListeners(): void {
		this.querySelector('#px-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#px-close')?.addEventListener('click', () => this.hide());

		// Tab switching
		this.querySelectorAll<HTMLElement>('[data-px-tab]').forEach(btn => {
			btn.addEventListener('click', () => {
				this.searchTab = btn.dataset.pxTab as 'videos' | 'vectors';
				this.results = [];
				this.vectorResults = [];
				this.totalHits = 0;
				this.page = 1;
				this.renderModal();
				this.setupListeners();
			});
		});

		// API key
		const keyInput = this.querySelector('#px-api-key') as HTMLInputElement;
		keyInput?.addEventListener('change', () => {
			setApiKey(keyInput.value.trim());
		});
		this.querySelector('#px-key-toggle')?.addEventListener('click', () => {
			if (keyInput) {
				keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
			}
		});

		const searchInput = this.querySelector('#px-search') as HTMLInputElement;
		searchInput?.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') this.search();
		});

		this.querySelector('#px-search-btn')?.addEventListener('click', () => this.search());
		this.querySelector('#px-prev')?.addEventListener('click', () => { this.page--; this.search(false); });
		this.querySelector('#px-next')?.addEventListener('click', () => { this.page++; this.search(false); });
	}

	private async search(resetPage = true): Promise<void> {
		if (this.loading) return;

		const query = (this.querySelector('#px-search') as HTMLInputElement)?.value.trim();
		const order = (this.querySelector('#px-order') as HTMLSelectElement)?.value;

		if (!query) return;
		if (resetPage) this.page = 1;

		this.loading = true;
		this.renderLoading();

		try {
			const params = new URLSearchParams({
				key: getApiKey(),
				q: query,
				page: String(this.page),
				per_page: '12',
				order: order || 'popular',
				safesearch: 'true',
			});

			if (this.searchTab === 'vectors') {
				params.set('image_type', 'vector');
				const res = await fetch(`https://pixabay.com/api/?${params}`);
				const data = await res.json();
				this.vectorResults = data.hits ?? [];
				this.results = [];
				this.totalHits = data.totalHits ?? 0;
			} else {
				const res = await fetch(`${API_URL}?${params}`);
				const data = await res.json();
				this.results = data.hits ?? [];
				this.vectorResults = [];
				this.totalHits = data.totalHits ?? 0;
			}
		} catch (err) {
			console.warn('Pixabay search failed:', err);
			this.results = [];
			this.totalHits = 0;
		}

		this.loading = false;
		this.renderResults();
	}

	private renderLoading(): void {
		const grid = this.querySelector('#px-results');
		if (grid) grid.innerHTML = '<div class="text-xs text-neutral-500 text-center py-12">Searching...</div>';
	}

	private renderResults(): void {
		const grid = this.querySelector('#px-results');
		if (!grid) return;

		const items = this.searchTab === 'vectors' ? this.vectorResults : this.results;

		if (items.length === 0) {
			grid.innerHTML = '<div class="text-xs text-neutral-500 text-center py-12">No results found</div>';
			this.updatePagination();
			return;
		}

		if (this.searchTab === 'vectors') {
			grid.innerHTML = `
				<div class="grid grid-cols-4 gap-3">
					${this.vectorResults.map(v => this.renderVectorCard(v)).join('')}
				</div>
			`;
		} else {
			grid.innerHTML = `
				<div class="grid grid-cols-3 gap-3">
					${this.results.map(v => this.renderVideoCard(v)).join('')}
				</div>
			`;
		}

		// Wire up download buttons
		grid.querySelectorAll<HTMLElement>('[data-download]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = parseInt(btn.dataset.download!);
				if (this.searchTab === 'vectors') this.downloadVector(id);
				else this.downloadVideo(id);
			});
		});

		// Wire up use-cached buttons
		grid.querySelectorAll<HTMLElement>('[data-use-cached]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = parseInt(btn.dataset.useCached!);
				this.useCachedVideo(id);
			});
		});

		// Wire up "use as shape" buttons
		grid.querySelectorAll<HTMLElement>('[data-use-shape]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = parseInt(btn.dataset.useShape!);
				this.useVectorAsShape(id);
			});
		});

		this.updatePagination();
	}

	private renderVectorCard(v: PixabayImage): string {
		const cached = this.cachedVectors.has(v.id);
		const isDownloading = this.downloading.has(v.id);

		return `
			<div class="bg-neutral-800 rounded overflow-hidden border border-neutral-700">
				<div class="relative bg-white">
					<img src="${v.previewURL}" class="w-full h-28 object-contain" alt="${v.tags}">
				</div>
				<div class="p-2">
					<div class="text-xs text-neutral-300 truncate mb-1">${v.tags}</div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs text-neutral-500">by ${v.user}</span>
						<a href="${v.pageURL}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300">Pixabay ↗</a>
					</div>
					${cached
						? `<div class="flex gap-1">
							<button data-use-shape="${v.id}" class="flex-1 px-2 py-1 text-xs bg-green-800 hover:bg-green-700 rounded border border-green-700 text-green-200">✓ ${this.cachedVectors.get(v.id)?.isSvg ? 'Create Shape' : 'Use as Image'}</button>
						</div>`
						: isDownloading
							? `<button class="w-full px-2 py-1 text-xs bg-neutral-700 rounded border border-neutral-600 text-neutral-400 cursor-wait" disabled>Downloading...</button>`
							: `<button data-download="${v.id}" class="w-full px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">Download SVG</button>`
					}
				</div>
			</div>
		`;
	}

	private async downloadVector(id: number): Promise<void> {
		const vector = this.vectorResults.find(v => v.id === id);
		if (!vector) return;

		this.downloading.add(id);
		this.renderResults();

		try {
			// Try vectorURL first (real SVG, needs full API access), fallback to largeImageURL (PNG)
			const svgUrl = vector.vectorURL;
			const imageUrl = svgUrl || vector.largeImageURL;
			const response = await fetch(imageUrl);
			const blob = await response.blob();
			const isSvg = blob.type === 'image/svg+xml' || imageUrl.endsWith('.svg');
			const arrayBuffer = await blob.arrayBuffer();
			const uint8 = new Uint8Array(arrayBuffer);

			const ext = isSvg ? 'svg' : 'png';
			const filename = `pixabay-vector-${id}.${ext}`;
			const saved = await window.promap.saveMediaBlob(uint8, filename);

			if (saved) {
				let thumbnail = '';
				try {
					if (!isSvg) {
						thumbnail = await this.blobToDataUrl(blob);
					}
				} catch { /* ignore */ }

				// If SVG, try to extract path data
				let svgPaths: string | undefined;
				if (isSvg) {
					const svgText = new TextDecoder().decode(uint8);
					svgPaths = svgText;
				}

				const cached: CachedVector = {
					id: vector.id,
					filename,
					name: vector.tags.split(',')[0]?.trim() || `vector-${id}`,
					thumbnail,
					user: vector.user,
					pageURL: vector.pageURL,
					isSvg,
					svgData: svgPaths,
				};
				this.cachedVectors.set(id, cached);
				this.saveCache();
			}
		} catch (err) {
			console.warn('Vector download failed:', err);
		}

		this.downloading.delete(id);
		this.renderResults();
	}

	private useVectorAsShape(id: number): void {
		const cached = this.cachedVectors.get(id);
		if (!cached) return;

		if (cached.isSvg && cached.svgData) {
			// Parse SVG and create custom shape from paths
			this.createShapeFromSVG(cached.svgData, cached.name);
		} else {
			// PNG fallback — add as image resource on a square shape
			const src = `media://${cached.filename}`;
			const existing = state.getResources().find(r => r.src === src);
			if (!existing) {
				state.addResource({
					name: cached.name,
					type: 'image',
					src,
					thumbnail: cached.thumbnail || undefined,
				});
			}
			const shape = state.addShape('square');
			state.updateShape(shape.id, {
				name: cached.name,
				resource: existing?.id ?? state.getResources().find(r => r.src === src)?.id ?? null,
				projectionType: 'fit',
			});
		}
	}

	private createShapeFromSVG(svgData: string, name: string): void {
		const parser = new DOMParser();
		const doc = parser.parseFromString(svgData, 'image/svg+xml');
		const svg = doc.querySelector('svg');
		if (!svg) return;

		// Get viewBox for coordinate scaling
		const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
		const svgWidth = viewBox?.[2] ?? parseFloat(svg.getAttribute('width') ?? '300');
		const svgHeight = viewBox?.[3] ?? parseFloat(svg.getAttribute('height') ?? '300');

		// Find all paths, polygons, rects, circles, etc.
		const points: Array<{ x: number; y: number }> = [];

		// Extract points from path elements
		const paths = doc.querySelectorAll('path');
		for (const path of paths) {
			const d = path.getAttribute('d');
			if (!d) continue;
			const pathPoints = this.parseSVGPath(d);
			if (pathPoints.length > points.length) {
				points.length = 0;
				points.push(...pathPoints);
			}
		}

		// Extract from polygon/polyline
		const polys = doc.querySelectorAll('polygon, polyline');
		for (const poly of polys) {
			const pointsStr = poly.getAttribute('points');
			if (!pointsStr) continue;
			const nums = pointsStr.trim().split(/[\s,]+/).map(Number);
			const polyPoints: Array<{ x: number; y: number }> = [];
			for (let i = 0; i < nums.length - 1; i += 2) {
				polyPoints.push({ x: nums[i], y: nums[i + 1] });
			}
			if (polyPoints.length > points.length) {
				points.length = 0;
				points.push(...polyPoints);
			}
		}

		if (points.length < 3) {
			// Not enough points — fallback to square
			const shape = state.addShape('square');
			state.updateShape(shape.id, { name });
			return;
		}

		// Normalize to 300x300 and limit to 20 points
		const scale = 300 / Math.max(svgWidth, svgHeight);
		let normalized = points.map(p => ({
			x: (p.x - (viewBox?.[0] ?? 0)) * scale,
			y: (p.y - (viewBox?.[1] ?? 0)) * scale,
		}));

		// Simplify if too many points (keep max 20)
		if (normalized.length > 20) {
			normalized = this.simplifyPoints(normalized, 20);
		}

		// Create n-shape with the extracted points
		const shape = state.addShape('n-shape', normalized.length);
		state.updateShape(shape.id, {
			name,
			points: normalized,
			size: { x: 300, y: 300 },
		});
	}

	private parseSVGPath(d: string): Array<{ x: number; y: number }> {
		const points: Array<{ x: number; y: number }> = [];
		let x = 0, y = 0;

		// Simple SVG path parser — handles M, L, H, V, Z, C (cubic bezier endpoints)
		const commands = d.match(/[MLHVCSTQAZmlhvcstqaz][^MLHVCSTQAZmlhvcstqaz]*/g);
		if (!commands) return points;

		for (const cmd of commands) {
			const type = cmd[0];
			const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

			switch (type) {
				case 'M':
					x = nums[0]; y = nums[1];
					points.push({ x, y });
					// Implicit lineto for remaining pairs
					for (let i = 2; i < nums.length - 1; i += 2) {
						x = nums[i]; y = nums[i + 1];
						points.push({ x, y });
					}
					break;
				case 'm':
					x += nums[0]; y += nums[1];
					points.push({ x, y });
					for (let i = 2; i < nums.length - 1; i += 2) {
						x += nums[i]; y += nums[i + 1];
						points.push({ x, y });
					}
					break;
				case 'L':
					for (let i = 0; i < nums.length - 1; i += 2) {
						x = nums[i]; y = nums[i + 1];
						points.push({ x, y });
					}
					break;
				case 'l':
					for (let i = 0; i < nums.length - 1; i += 2) {
						x += nums[i]; y += nums[i + 1];
						points.push({ x, y });
					}
					break;
				case 'H': x = nums[0]; points.push({ x, y }); break;
				case 'h': x += nums[0]; points.push({ x, y }); break;
				case 'V': y = nums[0]; points.push({ x, y }); break;
				case 'v': y += nums[0]; points.push({ x, y }); break;
				case 'C':
					// Cubic bezier — just take endpoint
					for (let i = 0; i < nums.length - 1; i += 6) {
						x = nums[i + 4]; y = nums[i + 5];
						points.push({ x, y });
					}
					break;
				case 'c':
					for (let i = 0; i < nums.length - 1; i += 6) {
						x += nums[i + 4]; y += nums[i + 5];
						points.push({ x, y });
					}
					break;
				case 'S': case 'Q':
					for (let i = 0; i < nums.length - 1; i += 4) {
						x = nums[i + 2]; y = nums[i + 3];
						points.push({ x, y });
					}
					break;
				case 's': case 'q':
					for (let i = 0; i < nums.length - 1; i += 4) {
						x += nums[i + 2]; y += nums[i + 3];
						points.push({ x, y });
					}
					break;
				case 'Z': case 'z':
					break;
			}
		}

		return points;
	}

	private simplifyPoints(points: Array<{ x: number; y: number }>, maxPoints: number): Array<{ x: number; y: number }> {
		if (points.length <= maxPoints) return points;

		// Douglas-Peucker simplification
		const step = points.length / maxPoints;
		const result: Array<{ x: number; y: number }> = [];
		for (let i = 0; i < maxPoints; i++) {
			result.push(points[Math.floor(i * step)]);
		}
		return result;
	}

	private renderVideoCard(v: PixabayVideo): string {
		const thumb = v.videos.tiny.thumbnail || v.videos.small.url;
		const cached = this.cachedVideos.has(v.id);
		const isDownloading = this.downloading.has(v.id);
		const duration = `${Math.floor(v.duration / 60)}:${(v.duration % 60).toString().padStart(2, '0')}`;

		return `
			<div class="bg-neutral-800 rounded overflow-hidden border border-neutral-700">
				<div class="relative">
					<video src="${v.videos.tiny.url}" class="w-full h-32 object-cover" muted loop preload="metadata"
						onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0;"></video>
					<div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-neutral-300">${duration}</div>
				</div>
				<div class="p-2">
					<div class="text-xs text-neutral-300 truncate mb-1">${v.tags}</div>
					<div class="flex items-center justify-between mb-2">
						<span class="text-xs text-neutral-500">by ${v.user}</span>
						<a href="${v.pageURL}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300">Pixabay ↗</a>
					</div>
					${cached
						? `<button data-use-cached="${v.id}" class="w-full px-2 py-1 text-xs bg-green-800 hover:bg-green-700 rounded border border-green-700 text-green-200">✓ Use Cached</button>`
						: isDownloading
							? `<button class="w-full px-2 py-1 text-xs bg-neutral-700 rounded border border-neutral-600 text-neutral-400 cursor-wait" disabled>Downloading...</button>`
							: `<button data-download="${v.id}" class="w-full px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">Download</button>`
					}
				</div>
			</div>
		`;
	}

	private async downloadVideo(id: number): Promise<void> {
		const video = this.results.find(v => v.id === id);
		if (!video) return;

		const quality = (this.querySelector('#px-quality') as HTMLSelectElement)?.value ?? 'medium';
		const videoData = video.videos[quality as keyof typeof video.videos];
		if (!videoData) return;

		this.downloading.add(id);
		this.renderResults();

		try {
			// Download the video
			const response = await fetch(videoData.url);
			const blob = await response.blob();

			// Convert to array buffer and save via Electron
			const arrayBuffer = await blob.arrayBuffer();
			const uint8 = new Uint8Array(arrayBuffer);

			// Save to media directory via IPC
			const filename = `pixabay-${id}-${quality}.mp4`;
			const saved = await window.promap.saveMediaBlob(uint8, filename);

			if (saved) {
				// Generate thumbnail
				const thumbUrl = video.videos.tiny.thumbnail || '';
				let thumbnail = '';
				if (thumbUrl) {
					try {
						const thumbRes = await fetch(thumbUrl);
						const thumbBlob = await thumbRes.blob();
						thumbnail = await this.blobToDataUrl(thumbBlob);
					} catch { /* use empty */ }
				}

				// Cache record
				const cached: CachedVideo = {
					id: video.id,
					filename,
					name: video.tags.split(',')[0]?.trim() || `pixabay-${id}`,
					thumbnail,
					user: video.user,
					pageURL: video.pageURL,
				};
				this.cachedVideos.set(id, cached);
				this.saveCache();

				// Add as resource
				const src = `media://${filename}`;
				state.addResource({
					name: cached.name,
					type: 'video',
					src,
					thumbnail: thumbnail || undefined,
				});
			}
		} catch (err) {
			console.warn('Download failed:', err);
		}

		this.downloading.delete(id);
		this.renderResults();
	}

	private useCachedVideo(id: number): void {
		const cached = this.cachedVideos.get(id);
		if (!cached) return;

		// Check if already in resources
		const existing = state.getResources().find(r => r.src === `media://${cached.filename}`);
		if (existing) return;

		state.addResource({
			name: cached.name,
			type: 'video',
			src: `media://${cached.filename}`,
			thumbnail: cached.thumbnail || undefined,
		});
	}

	private blobToDataUrl(blob: Blob): Promise<string> {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.readAsDataURL(blob);
		});
	}

	private updatePagination(): void {
		const info = this.querySelector('#px-info');
		const prevBtn = this.querySelector('#px-prev') as HTMLButtonElement;
		const nextBtn = this.querySelector('#px-next') as HTMLButtonElement;

		if (info) {
			const from = (this.page - 1) * 12 + 1;
			const to = Math.min(this.page * 12, this.totalHits);
			info.textContent = this.totalHits > 0 ? `${from}-${to} of ${this.totalHits.toLocaleString()}` : '';
		}

		if (prevBtn) prevBtn.disabled = this.page <= 1;
		if (nextBtn) nextBtn.disabled = this.page * 12 >= this.totalHits;
	}

	hide(): void {
		this.classList.remove('flex');
		this.classList.add('hidden');
		this.innerHTML = '';
	}
}

customElements.define('pixabay-modal', PixabayModal);
