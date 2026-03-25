use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::thread;

/// A decoded RGBA video frame.
pub struct VideoFrame {
	pub data: Vec<u8>,
	pub width: u32,
	pub height: u32,
}

/// Handle to a running video decoder thread.
struct DecoderHandle {
	receiver: mpsc::Receiver<VideoFrame>,
	_thread: thread::JoinHandle<()>,
	current_frame: Option<VideoFrame>,
	pub width: u32,
	pub height: u32,
}

/// Manages video decode threads for all active resources.
pub struct VideoManager {
	decoders: HashMap<String, DecoderHandle>,
}

impl VideoManager {
	pub fn new() -> Self {
		Self {
			decoders: HashMap::new(),
		}
	}

	/// Start decoding a video file for the given resource ID.
	pub fn open(&mut self, resource_id: &str, path: &str, fps: f64, do_loop: bool) {
		if self.decoders.contains_key(resource_id) {
			return;
		}

		let path = path.to_string();
		let (tx, rx) = mpsc::sync_channel::<VideoFrame>(2);

		let handle = thread::spawn(move || {
			if let Err(e) = decode_loop(&path, fps, do_loop, tx) {
				log::error!("Video decode error for {}: {}", path, e);
			}
		});

		self.decoders.insert(
			resource_id.to_string(),
			DecoderHandle {
				receiver: rx,
				_thread: handle,
				current_frame: None,
				width: 0,
				height: 0,
			},
		);
	}

	/// Get the latest decoded frame for a resource (non-blocking).
	pub fn get_frame(&mut self, resource_id: &str) -> Option<&VideoFrame> {
		let handle = self.decoders.get_mut(resource_id)?;

		// Drain to the latest frame
		while let Ok(frame) = handle.receiver.try_recv() {
			handle.width = frame.width;
			handle.height = frame.height;
			handle.current_frame = Some(frame);
		}

		handle.current_frame.as_ref()
	}

	/// Get video dimensions for a resource.
	pub fn dimensions(&self, resource_id: &str) -> Option<(u32, u32)> {
		let handle = self.decoders.get(resource_id)?;
		if handle.width > 0 {
			Some((handle.width, handle.height))
		} else {
			None
		}
	}

	/// Stop decoding a resource.
	pub fn close(&mut self, resource_id: &str) {
		self.decoders.remove(resource_id);
	}

	/// Stop all decoders.
	pub fn close_all(&mut self) {
		self.decoders.clear();
	}

	/// Get list of active resource IDs.
	pub fn active_ids(&self) -> Vec<String> {
		self.decoders.keys().cloned().collect()
	}
}

fn decode_loop(
	path: &str,
	fps: f64,
	do_loop: bool,
	tx: mpsc::SyncSender<VideoFrame>,
) -> Result<(), Box<dyn std::error::Error>> {
	ffmpeg_next::init()?;

	let frame_interval = if fps > 0.0 {
		std::time::Duration::from_secs_f64(1.0 / fps)
	} else {
		std::time::Duration::from_secs_f64(1.0 / 30.0)
	};

	loop {
		let mut ictx = ffmpeg_next::format::input(&Path::new(path))?;

		let video_stream = ictx
			.streams()
			.best(ffmpeg_next::media::Type::Video)
			.ok_or("No video stream found")?;
		let stream_index = video_stream.index();

		let context = ffmpeg_next::codec::context::Context::from_parameters(video_stream.parameters())?;
		let mut decoder = context.decoder().video()?;

		let mut scaler = ffmpeg_next::software::scaling::Context::get(
			decoder.format(),
			decoder.width(),
			decoder.height(),
			ffmpeg_next::format::Pixel::RGBA,
			decoder.width(),
			decoder.height(),
			ffmpeg_next::software::scaling::Flags::BILINEAR,
		)?;

		let mut frame_time = std::time::Instant::now();

		for (stream, packet) in ictx.packets() {
			if stream.index() != stream_index {
				continue;
			}

			decoder.send_packet(&packet)?;

			let mut decoded = ffmpeg_next::frame::Video::empty();
			while decoder.receive_frame(&mut decoded).is_ok() {
				// Throttle to target FPS
				let elapsed = frame_time.elapsed();
				if elapsed < frame_interval {
					std::thread::sleep(frame_interval - elapsed);
				}
				frame_time = std::time::Instant::now();

				let mut rgb_frame = ffmpeg_next::frame::Video::empty();
				scaler.run(&decoded, &mut rgb_frame)?;

				let data = rgb_frame.data(0).to_vec();
				let frame = VideoFrame {
					data,
					width: rgb_frame.width(),
					height: rgb_frame.height(),
				};

				if tx.send(frame).is_err() {
					return Ok(()); // Receiver dropped, stop
				}
			}
		}

		// Flush decoder
		decoder.send_eof()?;
		let mut decoded = ffmpeg_next::frame::Video::empty();
		while decoder.receive_frame(&mut decoded).is_ok() {
			let mut rgb_frame = ffmpeg_next::frame::Video::empty();
			scaler.run(&decoded, &mut rgb_frame)?;
			let data = rgb_frame.data(0).to_vec();
			let frame = VideoFrame {
				data,
				width: rgb_frame.width(),
				height: rgb_frame.height(),
			};
			if tx.send(frame).is_err() {
				return Ok(());
			}
		}

		if !do_loop {
			break;
		}
	}

	Ok(())
}
