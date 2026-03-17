import { state } from '../state/state-manager';

export interface ParsedSVGShape {
	points: Array<{ x: number; y: number }>;
	width: number;
	height: number;
}

export function parseSVGToPoints(svgText: string): ParsedSVGShape | null {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgText, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	if (!svg) return null;

	const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
	const svgWidth = viewBox?.[2] ?? parseFloat(svg.getAttribute('width') ?? '300');
	const svgHeight = viewBox?.[3] ?? parseFloat(svg.getAttribute('height') ?? '300');
	const offsetX = viewBox?.[0] ?? 0;
	const offsetY = viewBox?.[1] ?? 0;

	let bestPoints: Array<{ x: number; y: number }> = [];

	// Extract from path elements
	const paths = doc.querySelectorAll('path');
	for (const path of paths) {
		const d = path.getAttribute('d');
		if (!d) continue;
		const pts = parseSVGPath(d);
		if (pts.length > bestPoints.length) bestPoints = pts;
	}

	// Extract from polygon/polyline
	const polys = doc.querySelectorAll('polygon, polyline');
	for (const poly of polys) {
		const pointsStr = poly.getAttribute('points');
		if (!pointsStr) continue;
		const nums = pointsStr.trim().split(/[\s,]+/).map(Number);
		const pts: Array<{ x: number; y: number }> = [];
		for (let i = 0; i < nums.length - 1; i += 2) {
			pts.push({ x: nums[i], y: nums[i + 1] });
		}
		if (pts.length > bestPoints.length) bestPoints = pts;
	}

	// Extract from rect
	const rects = doc.querySelectorAll('rect');
	for (const rect of rects) {
		const x = parseFloat(rect.getAttribute('x') ?? '0');
		const y = parseFloat(rect.getAttribute('y') ?? '0');
		const w = parseFloat(rect.getAttribute('width') ?? '0');
		const h = parseFloat(rect.getAttribute('height') ?? '0');
		if (w > 0 && h > 0) {
			const pts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
			if (pts.length > bestPoints.length) bestPoints = pts;
		}
	}

	// Extract from circle/ellipse — approximate with polygon
	const circles = doc.querySelectorAll('circle, ellipse');
	for (const circle of circles) {
		const cx = parseFloat(circle.getAttribute('cx') ?? '0');
		const cy = parseFloat(circle.getAttribute('cy') ?? '0');
		const rx = parseFloat(circle.getAttribute('rx') ?? circle.getAttribute('r') ?? '0');
		const ry = parseFloat(circle.getAttribute('ry') ?? circle.getAttribute('r') ?? '0');
		if (rx > 0 && ry > 0) {
			const pts: Array<{ x: number; y: number }> = [];
			const segments = 32;
			for (let i = 0; i < segments; i++) {
				const angle = (i / segments) * Math.PI * 2;
				pts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
			}
			if (pts.length > bestPoints.length) bestPoints = pts;
		}
	}

	if (bestPoints.length < 3) return null;

	// Normalize to 300x300
	const scale = 300 / Math.max(svgWidth, svgHeight);
	let normalized = bestPoints.map(p => ({
		x: (p.x - offsetX) * scale,
		y: (p.y - offsetY) * scale,
	}));

	// Simplify if too many points (max 64)
	if (normalized.length > 64) {
		normalized = simplifyPoints(normalized, 64);
	}

	return {
		points: normalized,
		width: svgWidth * scale,
		height: svgHeight * scale,
	};
}

const CURVE_SEGMENTS = 8;

function sampleCubic(
	points: Array<{ x: number; y: number }>,
	x0: number, y0: number,
	cx1: number, cy1: number,
	cx2: number, cy2: number,
	x1: number, y1: number,
	segments: number,
): void {
	for (let s = 1; s <= segments; s++) {
		const t = s / segments;
		const it = 1 - t;
		const px = it * it * it * x0 + 3 * it * it * t * cx1 + 3 * it * t * t * cx2 + t * t * t * x1;
		const py = it * it * it * y0 + 3 * it * it * t * cy1 + 3 * it * t * t * cy2 + t * t * t * y1;
		points.push({ x: px, y: py });
	}
}

function sampleQuadratic(
	points: Array<{ x: number; y: number }>,
	x0: number, y0: number,
	cx: number, cy: number,
	x1: number, y1: number,
	segments: number,
): void {
	for (let s = 1; s <= segments; s++) {
		const t = s / segments;
		const it = 1 - t;
		const px = it * it * x0 + 2 * it * t * cx + t * t * x1;
		const py = it * it * y0 + 2 * it * t * cy + t * t * y1;
		points.push({ x: px, y: py });
	}
}

function sampleArc(
	points: Array<{ x: number; y: number }>,
	x0: number, y0: number,
	rx: number, ry: number,
	rotation: number, largeArc: number, sweep: number,
	x1: number, y1: number,
	segments: number,
): void {
	// Simplified arc: sample as line segments between start and end via midpoint approximation
	if (rx === 0 || ry === 0) {
		points.push({ x: x1, y: y1 });
		return;
	}
	const rot = (rotation * Math.PI) / 180;
	const cosRot = Math.cos(rot);
	const sinRot = Math.sin(rot);

	// Endpoint to center parameterization
	const dx = (x0 - x1) / 2;
	const dy = (y0 - y1) / 2;
	const x1p = cosRot * dx + sinRot * dy;
	const y1p = -sinRot * dx + cosRot * dy;

	let rxSq = rx * rx;
	let rySq = ry * ry;
	const x1pSq = x1p * x1p;
	const y1pSq = y1p * y1p;

	// Scale radii if needed
	const lambda = x1pSq / rxSq + y1pSq / rySq;
	if (lambda > 1) {
		const s = Math.sqrt(lambda);
		rx *= s;
		ry *= s;
		rxSq = rx * rx;
		rySq = ry * ry;
	}

	let sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
	sq = Math.sqrt(sq) * (largeArc === sweep ? -1 : 1);
	const cxp = sq * (rx * y1p / ry);
	const cyp = sq * -(ry * x1p / rx);

	const cx = cosRot * cxp - sinRot * cyp + (x0 + x1) / 2;
	const cy = sinRot * cxp + cosRot * cyp + (y0 + y1) / 2;

	const angle = (ux: number, uy: number, vx: number, vy: number) => {
		const dot = ux * vx + uy * vy;
		const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
		let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
		if (ux * vy - uy * vx < 0) a = -a;
		return a;
	};

	const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
	let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
	if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
	if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

	for (let s = 1; s <= segments; s++) {
		const t = theta1 + (s / segments) * dTheta;
		const px = cosRot * rx * Math.cos(t) - sinRot * ry * Math.sin(t) + cx;
		const py = sinRot * rx * Math.cos(t) + cosRot * ry * Math.sin(t) + cy;
		points.push({ x: px, y: py });
	}
}

function parseSVGPath(d: string): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	let x = 0, y = 0;

	const commands = d.match(/[MLHVCSTQAZmlhvcstqaz][^MLHVCSTQAZmlhvcstqaz]*/g);
	if (!commands) return points;

	for (const cmd of commands) {
		const type = cmd[0];
		const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

		switch (type) {
			case 'M':
				x = nums[0]; y = nums[1];
				points.push({ x, y });
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
				for (let i = 0; i < nums.length - 1; i += 6) {
					if (i + 5 < nums.length) {
						sampleCubic(points, x, y, nums[i], nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4], nums[i + 5], CURVE_SEGMENTS);
						x = nums[i + 4]; y = nums[i + 5];
					}
				}
				break;
			case 'c':
				for (let i = 0; i < nums.length - 1; i += 6) {
					if (i + 5 < nums.length) {
						sampleCubic(points, x, y, x + nums[i], y + nums[i + 1], x + nums[i + 2], y + nums[i + 3], x + nums[i + 4], y + nums[i + 5], CURVE_SEGMENTS);
						x += nums[i + 4]; y += nums[i + 5];
					}
				}
				break;
			case 'Q':
				for (let i = 0; i < nums.length - 1; i += 4) {
					if (i + 3 < nums.length) {
						sampleQuadratic(points, x, y, nums[i], nums[i + 1], nums[i + 2], nums[i + 3], CURVE_SEGMENTS);
						x = nums[i + 2]; y = nums[i + 3];
					}
				}
				break;
			case 'q':
				for (let i = 0; i < nums.length - 1; i += 4) {
					if (i + 3 < nums.length) {
						sampleQuadratic(points, x, y, x + nums[i], y + nums[i + 1], x + nums[i + 2], y + nums[i + 3], CURVE_SEGMENTS);
						x += nums[i + 2]; y += nums[i + 3];
					}
				}
				break;
			case 'S':
				for (let i = 0; i < nums.length - 1; i += 4) {
					if (i + 3 < nums.length) {
						// Reflect previous control point (approximate as midpoint)
						const cx1 = x, cy1 = y;
						sampleCubic(points, x, y, cx1, cy1, nums[i], nums[i + 1], nums[i + 2], nums[i + 3], CURVE_SEGMENTS);
						x = nums[i + 2]; y = nums[i + 3];
					}
				}
				break;
			case 's':
				for (let i = 0; i < nums.length - 1; i += 4) {
					if (i + 3 < nums.length) {
						const cx1 = x, cy1 = y;
						sampleCubic(points, x, y, cx1, cy1, x + nums[i], y + nums[i + 1], x + nums[i + 2], y + nums[i + 3], CURVE_SEGMENTS);
						x += nums[i + 2]; y += nums[i + 3];
					}
				}
				break;
			case 'A':
				for (let i = 0; i < nums.length; i += 7) {
					if (i + 6 < nums.length) {
						sampleArc(points, x, y, nums[i], nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4], nums[i + 5], nums[i + 6], CURVE_SEGMENTS);
						x = nums[i + 5]; y = nums[i + 6];
					}
				}
				break;
			case 'a':
				for (let i = 0; i < nums.length; i += 7) {
					if (i + 6 < nums.length) {
						sampleArc(points, x, y, nums[i], nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4], x + nums[i + 5], y + nums[i + 6], CURVE_SEGMENTS);
						x += nums[i + 5]; y += nums[i + 6];
					}
				}
				break;
			case 'Z': case 'z':
				break;
		}
	}

	return points;
}

function simplifyPoints(points: Array<{ x: number; y: number }>, maxPoints: number): Array<{ x: number; y: number }> {
	if (points.length <= maxPoints) return points;
	const step = points.length / maxPoints;
	const result: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < maxPoints; i++) {
		result.push(points[Math.floor(i * step)]);
	}
	return result;
}

export function createShapeFromSVGFile(file: File, saveTemplate = true): Promise<boolean> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => {
			const svgText = reader.result as string;
			const parsed = parseSVGToPoints(svgText);
			if (!parsed || parsed.points.length < 3) {
				resolve(false);
				return;
			}

			const name = file.name.replace(/\.svg$/i, '');
			if (saveTemplate) {
				state.addShapeTemplate(name, parsed.points);
			}
			const shape = state.addShape('n-shape', parsed.points.length);
			state.updateShape(shape.id, {
				name,
				points: parsed.points,
				size: { x: 300, y: 300 },
			});
			resolve(true);
		};
		reader.onerror = () => resolve(false);
		reader.readAsText(file);
	});
}
