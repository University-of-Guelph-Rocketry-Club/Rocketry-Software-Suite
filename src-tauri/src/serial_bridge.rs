use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Emitter;

use crate::protocol::{decode_packet, extract_frame, Protocol};

// ── Managed state ────────────────────────────────────────────────────────────

/// Held in Tauri's app state; coordinates the background serial thread.
pub struct SerialState {
    pub running: Arc<AtomicBool>,
    /// Used to pass an explicit stop signal while the thread may be blocking.
    pub stop_tx: Arc<Mutex<Option<std::sync::mpsc::SyncSender<()>>>>,
}

impl SerialState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            stop_tx: Arc::new(Mutex::new(None)),
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// List every serial port visible to the OS.
#[tauri::command]
pub fn list_serial_ports() -> Vec<serde_json::Value> {
    serialport::available_ports()
        .unwrap_or_default()
        .iter()
        .map(|p| {
            let (usb_vendor_id, usb_product_id, manufacturer, serial_number) = match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => (
                    Some(info.vid),
                    Some(info.pid),
                    info.manufacturer.clone(),
                    info.serial_number.clone(),
                ),
                _ => (None, None, None, None),
            };

            serde_json::json!({
                "name": p.port_name,
                "type": format!("{:?}", p.port_type),
                "usbVendorId": usb_vendor_id,
                "usbProductId": usb_product_id,
                "manufacturer": manufacturer,
                "serialNumber": serial_number,
            })
        })
        .collect()
}

/// Open a serial port and start decoding packets in a background thread.
/// `protocol_json` must be a serialised `Protocol` struct.
#[tauri::command]
pub fn open_serial_port(
    app_handle: AppHandle,
    state: tauri::State<'_, SerialState>,
    port: String,
    baud: u32,
    protocol_json: String,
) -> Result<(), String> {
    // Stop any existing reader
    state.running.store(false, Ordering::Relaxed);
    if let Ok(mut guard) = state.stop_tx.lock() {
        if let Some(tx) = guard.take() {
            let _ = tx.try_send(());
        }
    }
    // Give the old thread a moment to exit its read call
    std::thread::sleep(Duration::from_millis(200));

    let protocol: Protocol =
        serde_json::from_str(&protocol_json).map_err(|e| format!("Invalid protocol JSON: {e}"))?;

    let (tx, rx) = std::sync::mpsc::sync_channel::<()>(1);
    if let Ok(mut guard) = state.stop_tx.lock() {
        *guard = Some(tx);
    }

    state.running.store(true, Ordering::Relaxed);
    let running = state.running.clone();
    let handle = app_handle.clone();

    std::thread::spawn(move || {
        serial_read_loop(handle, running, rx, port, baud, protocol);
    });

    Ok(())
}

/// Signal the background serial thread to stop and close the port.
#[tauri::command]
pub fn close_serial_port(state: tauri::State<'_, SerialState>) {
    state.running.store(false, Ordering::Relaxed);
    if let Ok(mut guard) = state.stop_tx.lock() {
        if let Some(tx) = guard.take() {
            let _ = tx.try_send(());
        }
    }
}

// ── Background read loop ─────────────────────────────────────────────────────

fn serial_read_loop(
    handle: AppHandle,
    running: Arc<AtomicBool>,
    stop_rx: std::sync::mpsc::Receiver<()>,
    port: String,
    baud: u32,
    protocol: Protocol,
) {
    let mut retry_delay_ms = 500u64;

    while running.load(Ordering::Relaxed) {
        // Check for explicit stop signal (non-blocking)
        if stop_rx.try_recv().is_ok() {
            break;
        }

        let _ = handle.emit(
            "serial:status",
            &format!("Connecting to {port} @ {baud} baud…"),
        );

        match try_connect(&handle, &running, &stop_rx, &port, baud, &protocol) {
            Ok(()) => {
                // Clean exit (running set to false externally)
                let _ = handle.emit("serial:status", "Disconnected");
                break;
            }
            Err(e) => {
                let msg = format!("Error: {e}. Retrying in {retry_delay_ms}ms…");
                let _ = handle.emit("serial:status", &msg);
                eprintln!("[serial] {msg}");
                std::thread::sleep(Duration::from_millis(retry_delay_ms));
                retry_delay_ms = (retry_delay_ms * 2).min(10_000);
            }
        }
    }

    let _ = handle.emit("serial:status", "Closed");
}

fn try_connect(
    handle: &AppHandle,
    running: &Arc<AtomicBool>,
    stop_rx: &std::sync::mpsc::Receiver<()>,
    port: &str,
    baud: u32,
    protocol: &Protocol,
) -> Result<(), String> {
    let mut serial = serialport::new(port, baud)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| format!("Cannot open {port}: {e}"))?;

    let src_id = protocol
        .source_id
        .clone()
        .unwrap_or_else(|| "hardware".to_string());

    let _ = handle.emit(
        "serial:status",
        &format!("Connected: {port} @ {baud} baud"),
    );

    let mut acc: Vec<u8> = Vec::new();
    let mut buf = [0u8; 512];
    let mut seq_counter: u32 = 0;

    loop {
        // Honour stop signals
        if !running.load(Ordering::Relaxed) || stop_rx.try_recv().is_ok() {
            return Ok(());
        }

        match serial.read(&mut buf) {
            Ok(0) => {}
            Ok(n) => {
                acc.extend_from_slice(&buf[..n]);

                while let Some(frame) = extract_frame(&mut acc, protocol) {
                    // Forward raw hex to the inspector
                    let hex: String = frame
                        .iter()
                        .map(|b| format!("{b:02X}"))
                        .collect::<Vec<_>>()
                        .join(" ");
                    let _ = handle.emit("serial:raw", &hex);

                    if let Some(mut pkt) = decode_packet(&frame, protocol, &src_id) {
                        // Ensure every packet has a monotonic seq if firmware omitted it
                        if let Some(obj) = pkt.as_object_mut() {
                            if obj.get("seq").and_then(|v| v.as_u64()) == Some(0) {
                                seq_counter += 1;
                                obj.insert("seq".to_string(), serde_json::json!(seq_counter));
                            }
                        }
                        let _ = handle.emit("telemetry:packet", &pkt);
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(format!("Read error: {e}")),
        }
    }
}
