use std::collections::HashMap;
use std::sync::Arc;
use wgpu::util::DeviceExt;
use crate::protocol::{ExternalState, ResourceType, ShapeData};
use crate::shapes;
use crate::projection;
use crate::video::VideoManager;

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Vertex {
	position: [f32; 2],
	tex_coords: [f32; 2],
}

pub struct Renderer {
	device: wgpu::Device,
	queue: wgpu::Queue,
	surface: wgpu::Surface<'static>,
	surface_config: wgpu::SurfaceConfiguration,
	stencil_pipeline: wgpu::RenderPipeline,
	texture_pipeline: wgpu::RenderPipeline,
	sampler: wgpu::Sampler,
	bind_group_layout: wgpu::BindGroupLayout,
	depth_stencil_texture: wgpu::Texture,
	depth_stencil_view: wgpu::TextureView,
	video_textures: HashMap<String, (wgpu::Texture, wgpu::TextureView, wgpu::BindGroup)>,
	pub video_manager: VideoManager,
	pub screen_width: u32,
	pub screen_height: u32,
}

impl Renderer {
	pub fn new(window: Arc<winit::window::Window>) -> Self {
		let size = window.inner_size();
		let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
			backends: wgpu::Backends::all(),
			..Default::default()
		});

		let surface = instance.create_surface(window).unwrap();

		let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
			power_preference: wgpu::PowerPreference::HighPerformance,
			compatible_surface: Some(&surface),
			force_fallback_adapter: false,
		}))
		.expect("Failed to find GPU adapter");

		let (device, queue) = pollster::block_on(adapter.request_device(
			&wgpu::DeviceDescriptor {
				label: Some("promap-device"),
				required_features: wgpu::Features::empty(),
				required_limits: wgpu::Limits::default(),
				..Default::default()
			},
		))
		.expect("Failed to create device");

		let surface_caps = surface.get_capabilities(&adapter);
		let format = surface_caps.formats.iter()
			.find(|f| f.is_srgb())
			.copied()
			.unwrap_or(surface_caps.formats[0]);

		let surface_config = wgpu::SurfaceConfiguration {
			usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
			format,
			width: size.width.max(1),
			height: size.height.max(1),
			present_mode: wgpu::PresentMode::Fifo, // VSync
			alpha_mode: surface_caps.alpha_modes[0],
			view_formats: vec![],
			desired_maximum_frame_latency: 2,
		};
		surface.configure(&device, &surface_config);

		// Shaders
		let stencil_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
			label: Some("stencil_shader"),
			source: wgpu::ShaderSource::Wgsl(STENCIL_SHADER.into()),
		});

		let texture_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
			label: Some("texture_shader"),
			source: wgpu::ShaderSource::Wgsl(TEXTURE_SHADER.into()),
		});

		// Bind group layout for texture + sampler
		let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
			label: Some("texture_bind_group_layout"),
			entries: &[
				wgpu::BindGroupLayoutEntry {
					binding: 0,
					visibility: wgpu::ShaderStages::FRAGMENT,
					ty: wgpu::BindingType::Texture {
						sample_type: wgpu::TextureSampleType::Float { filterable: true },
						view_dimension: wgpu::TextureViewDimension::D2,
						multisampled: false,
					},
					count: None,
				},
				wgpu::BindGroupLayoutEntry {
					binding: 1,
					visibility: wgpu::ShaderStages::FRAGMENT,
					ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
					count: None,
				},
			],
		});

		let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
			label: Some("pipeline_layout"),
			bind_group_layouts: &[&bind_group_layout],
			push_constant_ranges: &[],
		});

		let stencil_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
			label: Some("stencil_pipeline_layout"),
			bind_group_layouts: &[],
			push_constant_ranges: &[],
		});

		// Depth/stencil texture
		let (depth_stencil_texture, depth_stencil_view) =
			create_depth_stencil_texture(&device, size.width.max(1), size.height.max(1));

		// Stencil pipeline — writes shape geometry to stencil buffer
		let stencil_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
			label: Some("stencil_pipeline"),
			layout: Some(&stencil_pipeline_layout),
			vertex: wgpu::VertexState {
				module: &stencil_shader,
				entry_point: Some("vs_main"),
				buffers: &[wgpu::VertexBufferLayout {
					array_stride: 8, // 2 x f32
					step_mode: wgpu::VertexStepMode::Vertex,
					attributes: &[wgpu::VertexAttribute {
						offset: 0,
						shader_location: 0,
						format: wgpu::VertexFormat::Float32x2,
					}],
				}],
				compilation_options: Default::default(),
			},
			fragment: Some(wgpu::FragmentState {
				module: &stencil_shader,
				entry_point: Some("fs_main"),
				targets: &[Some(wgpu::ColorTargetState {
					format,
					write_mask: wgpu::ColorWrites::empty(), // Don't write color
					blend: None,
				})],
				compilation_options: Default::default(),
			}),
			primitive: wgpu::PrimitiveState {
				topology: wgpu::PrimitiveTopology::TriangleList,
				..Default::default()
			},
			depth_stencil: Some(wgpu::DepthStencilState {
				format: wgpu::TextureFormat::Depth24PlusStencil8,
				depth_write_enabled: false,
				depth_compare: wgpu::CompareFunction::Always,
				stencil: wgpu::StencilState {
					front: wgpu::StencilFaceState {
						compare: wgpu::CompareFunction::Always,
						fail_op: wgpu::StencilOperation::Keep,
						depth_fail_op: wgpu::StencilOperation::Keep,
						pass_op: wgpu::StencilOperation::Replace,
					},
					back: wgpu::StencilFaceState {
						compare: wgpu::CompareFunction::Always,
						fail_op: wgpu::StencilOperation::Keep,
						depth_fail_op: wgpu::StencilOperation::Keep,
						pass_op: wgpu::StencilOperation::Replace,
					},
					read_mask: 0xFF,
					write_mask: 0xFF,
				},
				bias: Default::default(),
			}),
			multisample: Default::default(),
			multiview: None,
			cache: None,
		});

		// Texture pipeline — draws textured quad, stencil-tested
		let texture_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
			label: Some("texture_pipeline"),
			layout: Some(&pipeline_layout),
			vertex: wgpu::VertexState {
				module: &texture_shader,
				entry_point: Some("vs_main"),
				buffers: &[wgpu::VertexBufferLayout {
					array_stride: 16, // 2 x f32 position + 2 x f32 uv
					step_mode: wgpu::VertexStepMode::Vertex,
					attributes: &[
						wgpu::VertexAttribute {
							offset: 0,
							shader_location: 0,
							format: wgpu::VertexFormat::Float32x2,
						},
						wgpu::VertexAttribute {
							offset: 8,
							shader_location: 1,
							format: wgpu::VertexFormat::Float32x2,
						},
					],
				}],
				compilation_options: Default::default(),
			},
			fragment: Some(wgpu::FragmentState {
				module: &texture_shader,
				entry_point: Some("fs_main"),
				targets: &[Some(wgpu::ColorTargetState {
					format,
					write_mask: wgpu::ColorWrites::ALL,
					blend: Some(wgpu::BlendState::ALPHA_BLENDING),
				})],
				compilation_options: Default::default(),
			}),
			primitive: wgpu::PrimitiveState {
				topology: wgpu::PrimitiveTopology::TriangleList,
				..Default::default()
			},
			depth_stencil: Some(wgpu::DepthStencilState {
				format: wgpu::TextureFormat::Depth24PlusStencil8,
				depth_write_enabled: false,
				depth_compare: wgpu::CompareFunction::Always,
				stencil: wgpu::StencilState {
					front: wgpu::StencilFaceState {
						compare: wgpu::CompareFunction::Equal,
						fail_op: wgpu::StencilOperation::Keep,
						depth_fail_op: wgpu::StencilOperation::Keep,
						pass_op: wgpu::StencilOperation::Keep,
					},
					back: wgpu::StencilFaceState {
						compare: wgpu::CompareFunction::Equal,
						fail_op: wgpu::StencilOperation::Keep,
						depth_fail_op: wgpu::StencilOperation::Keep,
						pass_op: wgpu::StencilOperation::Keep,
					},
					read_mask: 0xFF,
					write_mask: 0x00,
				},
				bias: Default::default(),
			}),
			multisample: Default::default(),
			multiview: None,
			cache: None,
		});

		let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
			address_mode_u: wgpu::AddressMode::ClampToEdge,
			address_mode_v: wgpu::AddressMode::ClampToEdge,
			mag_filter: wgpu::FilterMode::Linear,
			min_filter: wgpu::FilterMode::Linear,
			..Default::default()
		});

		Self {
			device,
			queue,
			surface,
			surface_config,
			stencil_pipeline,
			texture_pipeline,
			sampler,
			bind_group_layout,
			depth_stencil_texture,
			depth_stencil_view,
			video_textures: HashMap::new(),
			video_manager: VideoManager::new(),
			screen_width: size.width.max(1),
			screen_height: size.height.max(1),
		}
	}

	pub fn resize(&mut self, width: u32, height: u32) {
		if width == 0 || height == 0 {
			return;
		}
		self.screen_width = width;
		self.screen_height = height;
		self.surface_config.width = width;
		self.surface_config.height = height;
		self.surface.configure(&self.device, &self.surface_config);

		let (tex, view) = create_depth_stencil_texture(&self.device, width, height);
		self.depth_stencil_texture = tex;
		self.depth_stencil_view = view;
	}

	pub fn render(&mut self, state: &ExternalState) {
		// Update video decoders based on current state
		self.sync_videos(state);

		// Upload latest video frames to GPU textures
		self.upload_video_frames();

		let output = match self.surface.get_current_texture() {
			Ok(t) => t,
			Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
				self.surface.configure(&self.device, &self.surface_config);
				return;
			}
			Err(e) => {
				log::error!("Surface error: {}", e);
				return;
			}
		};

		let view = output.texture.create_view(&Default::default());
		let mut encoder = self.device.create_command_encoder(&Default::default());

		// Clear pass
		{
			let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
				label: Some("clear_pass"),
				color_attachments: &[Some(wgpu::RenderPassColorAttachment {
					view: &view,
					resolve_target: None,
					ops: wgpu::Operations {
						load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
						store: wgpu::StoreOp::Store,
					},
				})],
				depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
					view: &self.depth_stencil_view,
					depth_ops: Some(wgpu::Operations {
						load: wgpu::LoadOp::Clear(1.0),
						store: wgpu::StoreOp::Store,
					}),
					stencil_ops: Some(wgpu::Operations {
						load: wgpu::LoadOp::Clear(0),
						store: wgpu::StoreOp::Store,
					}),
				}),
				..Default::default()
			});
		}

		// Sort shapes by zIndex
		let mut sorted_shapes: Vec<&ShapeData> = state.shapes.iter().collect();
		sorted_shapes.sort_by_key(|s| s.z_index);

		let sw = self.screen_width as f32;
		let sh = self.screen_height as f32;

		for shape in &sorted_shapes {
			if !shape.visible {
				continue;
			}

			let resource_id = match &shape.resource {
				Some(id) => id,
				None => continue,
			};

			// Find the resource
			let resource = state.resources.iter().find(|r| r.id == *resource_id);
			let resource = match resource {
				Some(r) => r,
				None => continue,
			};

			if !matches!(resource.resource_type, ResourceType::Video) {
				continue; // Phase 1: video only
			}

			// Check if we have a texture for this resource
			let bind_group = match self.video_textures.get(resource_id) {
				Some((_, _, bg)) => bg,
				None => continue,
			};

			let (tex_w, tex_h) = self.video_manager.dimensions(resource_id).unwrap_or((1, 1));
			let bounds = shapes::shape_bounds(shape);
			let center = shapes::shape_center(shape);
			let rotation = shape.rotation as f32;

			// Triangulate shape for stencil
			let mut stencil_verts = shapes::triangulate_shape(shape);
			shapes::rotate_points(&mut stencil_verts, center, rotation);

			// Convert pixel coords to NDC
			let stencil_ndc: Vec<[f32; 2]> = stencil_verts
				.iter()
				.map(|v| pixel_to_ndc(v[0], v[1], sw, sh))
				.collect();

			if stencil_ndc.is_empty() {
				continue;
			}

			let stencil_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
				label: Some("stencil_verts"),
				contents: bytemuck::cast_slice(&stencil_ndc),
				usage: wgpu::BufferUsages::VERTEX,
			});

			// Stencil pass — write shape to stencil
			{
				let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
					label: Some("stencil_pass"),
					color_attachments: &[Some(wgpu::RenderPassColorAttachment {
						view: &view,
						resolve_target: None,
						ops: wgpu::Operations {
							load: wgpu::LoadOp::Load,
							store: wgpu::StoreOp::Store,
						},
					})],
					depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
						view: &self.depth_stencil_view,
						depth_ops: None,
						stencil_ops: Some(wgpu::Operations {
							load: wgpu::LoadOp::Clear(0),
							store: wgpu::StoreOp::Store,
						}),
					}),
					..Default::default()
				});
				pass.set_pipeline(&self.stencil_pipeline);
				pass.set_stencil_reference(1);
				pass.set_vertex_buffer(0, stencil_buffer.slice(..));
				pass.draw(0..stencil_ndc.len() as u32, 0..1);
			}

			// Textured quad pass — draw video, clipped by stencil
			let (tx, ty, tw, th) = projection::project_texture(
				shape,
				bounds,
				tex_w as f32,
				tex_h as f32,
			);

			let mut quad_verts = [
				[tx, ty],
				[tx + tw, ty],
				[tx + tw, ty + th],
				[tx, ty],
				[tx + tw, ty + th],
				[tx, ty + th],
			];
			shapes::rotate_points(&mut quad_verts, center, rotation);

			let quad_data: Vec<Vertex> = quad_verts
				.iter()
				.zip([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0], [1.0, 1.0], [0.0, 1.0]])
				.map(|(pos, uv)| Vertex {
					position: pixel_to_ndc(pos[0], pos[1], sw, sh),
					tex_coords: uv,
				})
				.collect();

			let quad_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
				label: Some("quad_verts"),
				contents: bytemuck::cast_slice(&quad_data),
				usage: wgpu::BufferUsages::VERTEX,
			});

			{
				let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
					label: Some("texture_pass"),
					color_attachments: &[Some(wgpu::RenderPassColorAttachment {
						view: &view,
						resolve_target: None,
						ops: wgpu::Operations {
							load: wgpu::LoadOp::Load,
							store: wgpu::StoreOp::Store,
						},
					})],
					depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
						view: &self.depth_stencil_view,
						depth_ops: None,
						stencil_ops: Some(wgpu::Operations {
							load: wgpu::LoadOp::Load,
							store: wgpu::StoreOp::Store,
						}),
					}),
					..Default::default()
				});
				pass.set_pipeline(&self.texture_pipeline);
				pass.set_stencil_reference(1);
				pass.set_bind_group(0, bind_group, &[]);
				pass.set_vertex_buffer(0, quad_buffer.slice(..));
				pass.draw(0..6, 0..1);
			}
		}

		self.queue.submit(std::iter::once(encoder.finish()));
		output.present();
	}

	fn sync_videos(&mut self, state: &ExternalState) {
		// Find which resource IDs are needed
		let needed: HashMap<&str, (&ShapeData, &str)> = state
			.shapes
			.iter()
			.filter(|s| s.visible && s.resource.is_some())
			.filter_map(|s| {
				let rid = s.resource.as_ref().unwrap();
				let res = state.resources.iter().find(|r| r.id == *rid)?;
				if !matches!(res.resource_type, ResourceType::Video) {
					return None;
				}
				let path = res.resolved_src.as_deref().unwrap_or(&res.src);
				Some((rid.as_str(), (s, path)))
			})
			.collect();

		// Stop decoders for resources no longer needed
		let active = self.video_manager.active_ids();
		for id in &active {
			if !needed.contains_key(id.as_str()) {
				self.video_manager.close(id);
				self.video_textures.remove(id);
			}
		}

		// Start decoders for new resources
		for (id, (shape, path)) in &needed {
			if !self.video_manager.active_ids().contains(&id.to_string()) && shape.playing {
				self.video_manager.open(id, path, shape.fps, shape.loop_playback);
			}
		}
	}

	fn upload_video_frames(&mut self) {
		let active = self.video_manager.active_ids();
		for id in &active {
			let frame = match self.video_manager.get_frame(id) {
				Some(f) => f,
				None => continue,
			};

			let size = wgpu::Extent3d {
				width: frame.width,
				height: frame.height,
				depth_or_array_layers: 1,
			};

			// Create or recreate texture if dimensions changed
			let needs_new = match self.video_textures.get(id) {
				None => true,
				Some((tex, _, _)) => tex.size() != size,
			};

			if needs_new {
				let texture = self.device.create_texture(&wgpu::TextureDescriptor {
					label: Some("video_texture"),
					size,
					mip_level_count: 1,
					sample_count: 1,
					dimension: wgpu::TextureDimension::D2,
					format: wgpu::TextureFormat::Rgba8UnormSrgb,
					usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
					view_formats: &[],
				});
				let view = texture.create_view(&Default::default());
				let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
					label: Some("video_bind_group"),
					layout: &self.bind_group_layout,
					entries: &[
						wgpu::BindGroupEntry {
							binding: 0,
							resource: wgpu::BindingResource::TextureView(&view),
						},
						wgpu::BindGroupEntry {
							binding: 1,
							resource: wgpu::BindingResource::Sampler(&self.sampler),
						},
					],
				});
				self.video_textures.insert(id.clone(), (texture, view, bind_group));
			}

			if let Some((tex, _, _)) = self.video_textures.get(id) {
				self.queue.write_texture(
					wgpu::TexelCopyTextureInfo {
						texture: tex,
						mip_level: 0,
						origin: wgpu::Origin3d::ZERO,
						aspect: wgpu::TextureAspect::All,
					},
					&frame.data,
					wgpu::TexelCopyBufferLayout {
						offset: 0,
						bytes_per_row: Some(4 * frame.width),
						rows_per_image: Some(frame.height),
					},
					size,
				);
			}
		}
	}
}

fn pixel_to_ndc(x: f32, y: f32, screen_w: f32, screen_h: f32) -> [f32; 2] {
	[
		(x / screen_w) * 2.0 - 1.0,
		1.0 - (y / screen_h) * 2.0, // Y flipped
	]
}

fn create_depth_stencil_texture(
	device: &wgpu::Device,
	width: u32,
	height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
	let texture = device.create_texture(&wgpu::TextureDescriptor {
		label: Some("depth_stencil"),
		size: wgpu::Extent3d {
			width,
			height,
			depth_or_array_layers: 1,
		},
		mip_level_count: 1,
		sample_count: 1,
		dimension: wgpu::TextureDimension::D2,
		format: wgpu::TextureFormat::Depth24PlusStencil8,
		usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
		view_formats: &[],
	});
	let view = texture.create_view(&Default::default());
	(texture, view)
}

const STENCIL_SHADER: &str = r#"
@vertex
fn vs_main(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
	return vec4<f32>(position, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
	return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
"#;

const TEXTURE_SHADER: &str = r#"
struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) tex_coords: vec2<f32>,
}

@group(0) @binding(0) var t_texture: texture_2d<f32>;
@group(0) @binding(1) var t_sampler: sampler;

@vertex
fn vs_main(@location(0) position: vec2<f32>, @location(1) tex_coords: vec2<f32>) -> VertexOutput {
	var out: VertexOutput;
	out.position = vec4<f32>(position, 0.0, 1.0);
	out.tex_coords = tex_coords;
	return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
	return textureSample(t_texture, t_sampler, in.tex_coords);
}
"#;
