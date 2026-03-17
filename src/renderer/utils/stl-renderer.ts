import * as THREE from 'three';
import { CanvasSource, Texture } from 'pixi.js';

interface StlEntry {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	renderer: THREE.WebGLRenderer;
	mesh: THREE.Mesh;
	canvas: HTMLCanvasElement;
	source: CanvasSource;
	texture: Texture;
	rotationSpeed: number;
}

const entries = new Map<string, StlEntry>();
let animating = false;

function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();

	// Check if binary or ASCII
	const text = new TextDecoder().decode(buffer.slice(0, 80));
	if (text.startsWith('solid') && !isBinarySTL(buffer)) {
		return parseASCII(new TextDecoder().decode(buffer));
	}
	return parseBinary(buffer);

	function isBinarySTL(buf: ArrayBuffer): boolean {
		const view = new DataView(buf);
		const faceCount = view.getUint32(80, true);
		return buf.byteLength === 84 + faceCount * 50;
	}

	function parseBinary(buf: ArrayBuffer): THREE.BufferGeometry {
		const view = new DataView(buf);
		const faceCount = view.getUint32(80, true);
		const vertices = new Float32Array(faceCount * 9);
		const normals = new Float32Array(faceCount * 9);

		for (let i = 0; i < faceCount; i++) {
			const offset = 84 + i * 50;
			const nx = view.getFloat32(offset, true);
			const ny = view.getFloat32(offset + 4, true);
			const nz = view.getFloat32(offset + 8, true);

			for (let v = 0; v < 3; v++) {
				const vOffset = offset + 12 + v * 12;
				const idx = i * 9 + v * 3;
				vertices[idx] = view.getFloat32(vOffset, true);
				vertices[idx + 1] = view.getFloat32(vOffset + 4, true);
				vertices[idx + 2] = view.getFloat32(vOffset + 8, true);
				normals[idx] = nx;
				normals[idx + 1] = ny;
				normals[idx + 2] = nz;
			}
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
		return geo;
	}

	function parseASCII(str: string): THREE.BufferGeometry {
		const verts: number[] = [];
		const norms: number[] = [];
		let currentNormal = [0, 0, 1];

		const lines = str.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('facet normal')) {
				const parts = trimmed.split(/\s+/);
				currentNormal = [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])];
			} else if (trimmed.startsWith('vertex')) {
				const parts = trimmed.split(/\s+/);
				verts.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
				norms.push(...currentNormal);
			}
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
		geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(norms), 3));
		return geo;
	}

	return geometry;
}

export function createStlEntry(resourceId: string, buffer: ArrayBuffer, rotationSpeed: number): { source: CanvasSource; texture: Texture } {
	// Clean up existing
	destroyStlEntry(resourceId);

	const size = 512;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;

	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
	renderer.setSize(size, size);
	renderer.setClearColor(0x000000, 0);

	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

	// Lighting
	const ambient = new THREE.AmbientLight(0x404040, 2);
	scene.add(ambient);
	const directional = new THREE.DirectionalLight(0xffffff, 1.5);
	directional.position.set(1, 1, 1);
	scene.add(directional);
	const backLight = new THREE.DirectionalLight(0x4488ff, 0.8);
	backLight.position.set(-1, -0.5, -1);
	scene.add(backLight);

	// Parse and add mesh
	const geometry = parseSTL(buffer);
	geometry.computeBoundingBox();
	geometry.center();

	const material = new THREE.MeshPhongMaterial({
		color: 0xcccccc,
		specular: 0x444444,
		shininess: 30,
		flatShading: false,
	});

	// Compute smooth normals if originals are face normals
	geometry.computeVertexNormals();

	const mesh = new THREE.Mesh(geometry, material);
	scene.add(mesh);

	// Fit camera to model
	const box = new THREE.Box3().setFromObject(mesh);
	const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
	camera.position.set(0, 0, maxDim * 1.8);
	camera.lookAt(0, 0, 0);

	// Initial render
	renderer.render(scene, camera);

	const source = new CanvasSource({ resource: canvas });
	const texture = new Texture({ source });

	entries.set(resourceId, {
		scene,
		camera,
		renderer,
		mesh,
		canvas,
		source,
		texture,
		rotationSpeed,
	});

	startAnimation();

	return { source, texture };
}

export function updateStlRotationSpeed(resourceId: string, speed: number): void {
	const entry = entries.get(resourceId);
	if (entry) entry.rotationSpeed = speed;
}

export function destroyStlEntry(resourceId: string): void {
	const entry = entries.get(resourceId);
	if (!entry) return;

	entry.renderer.dispose();
	(entry.mesh.geometry as THREE.BufferGeometry).dispose();
	(entry.mesh.material as THREE.Material).dispose();
	entries.delete(resourceId);
}

export function tickStlEntries(playingIds?: Set<string>, speedMultipliers?: Map<string, number>): void {
	for (const [id, entry] of entries) {
		if (playingIds && !playingIds.has(id)) continue;
		const multiplier = speedMultipliers?.get(id) ?? 1;
		const speed = entry.rotationSpeed * multiplier;
		if (speed !== 0) {
			entry.mesh.rotation.y += speed * 0.02;
			entry.renderer.render(entry.scene, entry.camera);
			entry.source.update();
		}
	}
}

function startAnimation(): void {
	if (animating) return;
	animating = true;
}

export function hasStlEntries(): boolean {
	return entries.size > 0;
}

export function getStlCanvas(resourceId: string): HTMLCanvasElement | null {
	return entries.get(resourceId)?.canvas ?? null;
}

export function getStlTexture(resourceId: string): Texture | null {
	return entries.get(resourceId)?.texture ?? null;
}
