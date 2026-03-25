mod ipc;
mod projection;
mod protocol;
mod renderer;
mod shapes;
mod video;

use protocol::{ExternalState, IpcMessage, OutgoingMessage};
use renderer::Renderer;
use std::io::{self, BufReader, BufWriter};
use std::sync::{Arc, Mutex};
use std::thread;
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, EventLoop};
use winit::window::{Window, WindowId};

struct App {
	window: Option<Arc<Window>>,
	renderer: Option<Renderer>,
	state: Arc<Mutex<Option<ExternalState>>>,
	monitor_index: usize,
}

impl ApplicationHandler for App {
	fn resumed(&mut self, event_loop: &ActiveEventLoop) {
		if self.window.is_some() {
			return;
		}

		// Find target monitor
		let monitors: Vec<_> = event_loop.available_monitors().collect();
		let target = monitors.get(self.monitor_index).or_else(|| monitors.first());

		let mut attrs = Window::default_attributes()
			.with_title("ProMap Renderer")
			.with_decorations(false);

		if let Some(monitor) = target {
			let pos = monitor.position();
			let size = monitor.size();
			attrs = attrs
				.with_position(winit::dpi::PhysicalPosition::new(pos.x, pos.y))
				.with_inner_size(winit::dpi::PhysicalSize::new(size.width, size.height))
				.with_fullscreen(Some(winit::window::Fullscreen::Borderless(Some(monitor.clone()))));
		} else {
			attrs = attrs.with_inner_size(winit::dpi::PhysicalSize::new(1920u32, 1080u32));
		}

		let window = Arc::new(event_loop.create_window(attrs).expect("Failed to create window"));
		let renderer = Renderer::new(Arc::clone(&window));

		self.window = Some(window);
		self.renderer = Some(renderer);

		log::info!("Window and renderer initialized");
	}

	fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
		match event {
			WindowEvent::CloseRequested => {
				event_loop.exit();
			}
			WindowEvent::Resized(size) => {
				if let Some(renderer) = &mut self.renderer {
					renderer.resize(size.width, size.height);
				}
			}
			WindowEvent::RedrawRequested => {
				if let (Some(renderer), Ok(state_guard)) =
					(&mut self.renderer, self.state.lock())
				{
					if let Some(state) = state_guard.as_ref() {
						renderer.render(state);
					}
				}
				if let Some(window) = &self.window {
					window.request_redraw();
				}
			}
			_ => {}
		}
	}

	fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
		if let Some(window) = &self.window {
			window.request_redraw();
		}
	}
}

fn main() {
	env_logger::init();

	let args: Vec<String> = std::env::args().collect();

	let _projector_id: u32 = args
		.iter()
		.position(|a| a == "--projector-id")
		.and_then(|i| args.get(i + 1))
		.and_then(|v| v.parse().ok())
		.unwrap_or(0);

	let monitor_index: usize = args
		.iter()
		.position(|a| a == "--monitor")
		.and_then(|i| args.get(i + 1))
		.and_then(|v| v.parse().ok())
		.unwrap_or(0);

	log::info!("ProMap Native Renderer starting — monitor={}", monitor_index);

	let state: Arc<Mutex<Option<ExternalState>>> = Arc::new(Mutex::new(None));
	let state_writer = Arc::clone(&state);

	// IPC thread — reads from stdin, updates shared state
	thread::spawn(move || {
		let mut stdout_writer = BufWriter::new(io::stdout().lock());
		let _ = ipc::write_message(&mut stdout_writer, &OutgoingMessage::Ready);

		let stdin = io::stdin().lock();
		let mut reader = BufReader::new(stdin);

		loop {
			match ipc::read_message(&mut reader) {
				Ok(IpcMessage::StateUpdate { state: new_state }) => {
					log::debug!(
						"State update: {} shapes, {} resources",
						new_state.shapes.len(),
						new_state.resources.len()
					);
					if let Ok(mut guard) = state_writer.lock() {
						*guard = Some(new_state);
					}
				}
				Ok(IpcMessage::Shutdown) => {
					log::info!("Shutdown requested");
					std::process::exit(0);
				}
				Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => {
					log::info!("Stdin closed");
					std::process::exit(0);
				}
				Err(e) => {
					log::error!("IPC error: {}", e);
					std::process::exit(1);
				}
			}
		}
	});

	let event_loop = EventLoop::new().expect("Failed to create event loop");
	let mut app = App {
		window: None,
		renderer: None,
		state,
		monitor_index,
	};

	event_loop.run_app(&mut app).expect("Event loop error");
}
