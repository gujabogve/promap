use crate::protocol::{ProjectionType, ShapeData};

/// Calculate the textured quad position/size for a given projection type.
/// Returns (x, y, w, h) in pixel coordinates for where the texture should be drawn.
pub fn project_texture(
	shape: &ShapeData,
	bounds: (f32, f32, f32, f32),
	tex_w: f32,
	tex_h: f32,
) -> (f32, f32, f32, f32) {
	let (bx, by, bw, bh) = bounds;

	match shape.projection_type {
		ProjectionType::Default => (bx, by, bw, bh),

		ProjectionType::Fit => {
			let tw = if tex_w > 0.0 { tex_w } else { bw };
			let th = if tex_h > 0.0 { tex_h } else { bh };
			let scale = (bw / tw).min(bh / th);
			let w = tw * scale;
			let h = th * scale;
			(bx + (bw - w) / 2.0, by + (bh - h) / 2.0, w, h)
		}

		ProjectionType::Masked => {
			let ox = shape.resource_offset.x as f32;
			let oy = shape.resource_offset.y as f32;
			let s = shape.resource_scale as f32;
			(bx + ox, by + oy, tex_w * s, tex_h * s)
		}

		ProjectionType::Mapped => {
			let ox = shape.resource_offset.x as f32;
			let oy = shape.resource_offset.y as f32;
			let s = shape.resource_scale as f32;
			(bx - ox, by - oy, tex_w * s, tex_h * s)
		}
	}
}
