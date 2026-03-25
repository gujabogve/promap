use std::io::{self, Read, Write};
use crate::protocol::{IpcMessage, OutgoingMessage};

const MAX_MESSAGE_SIZE: u32 = 16 * 1024 * 1024; // 16 MB

/// Read a length-prefixed message from a stream.
/// Format: 4 bytes LE length + JSON payload.
pub fn read_message<R: Read>(reader: &mut R) -> io::Result<IpcMessage> {
	let mut len_buf = [0u8; 4];
	reader.read_exact(&mut len_buf)?;
	let len = u32::from_le_bytes(len_buf);

	if len > MAX_MESSAGE_SIZE {
		return Err(io::Error::new(
			io::ErrorKind::InvalidData,
			format!("Message too large: {} bytes", len),
		));
	}

	let mut payload = vec![0u8; len as usize];
	reader.read_exact(&mut payload)?;

	serde_json::from_slice(&payload).map_err(|e| {
		io::Error::new(io::ErrorKind::InvalidData, format!("Invalid JSON: {}", e))
	})
}

/// Write a length-prefixed message to a stream.
pub fn write_message<W: Write>(writer: &mut W, msg: &OutgoingMessage) -> io::Result<()> {
	let payload = serde_json::to_vec(msg)
		.map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
	let len = (payload.len() as u32).to_le_bytes();
	writer.write_all(&len)?;
	writer.write_all(&payload)?;
	writer.flush()
}
