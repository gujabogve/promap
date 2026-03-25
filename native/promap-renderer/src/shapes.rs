use crate::protocol::{ShapeData, ShapeType};

/// Triangulate shape points into vertex positions for stencil rendering.
/// Returns vec of (x, y) in pixel coordinates.
pub fn triangulate_shape(shape: &ShapeData) -> Vec<[f32; 2]> {
	match shape.shape_type {
		ShapeType::Circle => triangulate_ellipse(shape),
		_ => triangulate_polygon(shape),
	}
}

fn triangulate_ellipse(shape: &ShapeData) -> Vec<[f32; 2]> {
	let cx = (shape.position.x + shape.size.x / 2.0) as f32;
	let cy = (shape.position.y + shape.size.y / 2.0) as f32;
	let rx = (shape.size.x / 2.0) as f32;
	let ry = (shape.size.y / 2.0) as f32;

	let segments = 64;
	let mut vertices = Vec::with_capacity(segments * 3);

	for i in 0..segments {
		let a0 = (i as f32 / segments as f32) * std::f32::consts::TAU;
		let a1 = ((i + 1) as f32 / segments as f32) * std::f32::consts::TAU;

		vertices.push([cx, cy]);
		vertices.push([cx + rx * a0.cos(), cy + ry * a0.sin()]);
		vertices.push([cx + rx * a1.cos(), cy + ry * a1.sin()]);
	}

	vertices
}

fn triangulate_polygon(shape: &ShapeData) -> Vec<[f32; 2]> {
	let world_points: Vec<f64> = shape
		.points
		.iter()
		.flat_map(|p| [p.x + shape.position.x, p.y + shape.position.y])
		.collect();

	let indices = earcutr::earcut(&world_points, &[], 2).unwrap_or_default();

	indices
		.iter()
		.map(|&i| [world_points[i * 2] as f32, world_points[i * 2 + 1] as f32])
		.collect()
}

/// Get the bounding box of a shape in pixel coordinates.
pub fn shape_bounds(shape: &ShapeData) -> (f32, f32, f32, f32) {
	if matches!(shape.shape_type, ShapeType::Circle) {
		let x = shape.position.x as f32;
		let y = shape.position.y as f32;
		let w = shape.size.x as f32;
		let h = shape.size.y as f32;
		return (x, y, w, h);
	}

	let xs: Vec<f64> = shape.points.iter().map(|p| p.x + shape.position.x).collect();
	let ys: Vec<f64> = shape.points.iter().map(|p| p.y + shape.position.y).collect();
	let min_x = xs.iter().cloned().fold(f64::INFINITY, f64::min) as f32;
	let min_y = ys.iter().cloned().fold(f64::INFINITY, f64::min) as f32;
	let max_x = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max) as f32;
	let max_y = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max) as f32;
	(min_x, min_y, max_x - min_x, max_y - min_y)
}

/// Apply rotation to shape vertices around shape center.
pub fn rotate_points(vertices: &mut [[f32; 2]], center: [f32; 2], angle_rad: f32) {
	if angle_rad.abs() < 1e-6 {
		return;
	}
	let cos = angle_rad.cos();
	let sin = angle_rad.sin();
	for v in vertices.iter_mut() {
		let dx = v[0] - center[0];
		let dy = v[1] - center[1];
		v[0] = center[0] + dx * cos - dy * sin;
		v[1] = center[1] + dx * sin + dy * cos;
	}
}

/// Get the center of a shape in pixel coordinates.
pub fn shape_center(shape: &ShapeData) -> [f32; 2] {
	if matches!(shape.shape_type, ShapeType::Circle) {
		return [
			(shape.position.x + shape.size.x / 2.0) as f32,
			(shape.position.y + shape.size.y / 2.0) as f32,
		];
	}
	let xs: Vec<f64> = shape.points.iter().map(|p| p.x + shape.position.x).collect();
	let ys: Vec<f64> = shape.points.iter().map(|p| p.y + shape.position.y).collect();
	let min_x = xs.iter().cloned().fold(f64::INFINITY, f64::min);
	let max_x = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
	let min_y = ys.iter().cloned().fold(f64::INFINITY, f64::min);
	let max_y = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
	[((min_x + max_x) / 2.0) as f32, ((min_y + max_y) / 2.0) as f32]
}
