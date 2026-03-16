use serde::{Deserialize, Serialize};

// ── Type definitions ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolType {
    Binary,
    Csv,
    Json,
    Cobs,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Endian {
    #[default]
    Little,
    Big,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChecksumType {
    None,
    Xor,
    Crc8,
    Crc16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
    Uint8,
    Uint16,
    Uint32,
    Int8,
    Int16,
    Int32,
    Float32,
    Float64,
    Bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolField {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: FieldType,
    pub offset: usize,
    pub scale: Option<f64>,
    pub bias: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Protocol {
    pub name: String,
    #[serde(rename = "type")]
    pub protocol_type: ProtocolType,
    #[serde(default)]
    pub endian: Endian,
    pub frame_size: Option<usize>,
    pub sync_bytes: Option<Vec<u8>>,
    pub checksum_type: Option<ChecksumType>,
    pub checksum_offset: Option<usize>,
    pub fields: Vec<ProtocolField>,
    // CSV
    pub delimiter: Option<String>,
    pub has_header: Option<bool>,
    pub csv_fields: Option<Vec<String>>,
    // Source routing
    pub source_id: Option<String>,
}

// ── Frame extraction ────────────────────────────────────────────────────────

/// Try to extract one complete frame from the accumulator.
/// Consumed bytes are drained from the front of `acc`.
pub fn extract_frame(acc: &mut Vec<u8>, protocol: &Protocol) -> Option<Vec<u8>> {
    match protocol.protocol_type {
        ProtocolType::Binary => extract_binary_frame(acc, protocol),
        ProtocolType::Csv | ProtocolType::Json => extract_line_frame(acc),
        ProtocolType::Cobs => extract_cobs_frame(acc),
    }
}

fn extract_line_frame(acc: &mut Vec<u8>) -> Option<Vec<u8>> {
    let pos = acc.iter().position(|&b| b == b'\n')?;
    let line: Vec<u8> = acc[..pos]
        .iter()
        .copied()
        .filter(|&b| b != b'\r')
        .collect();
    acc.drain(..=pos);
    if line.is_empty() {
        None
    } else {
        Some(line)
    }
}

fn extract_binary_frame(acc: &mut Vec<u8>, protocol: &Protocol) -> Option<Vec<u8>> {
    let frame_size = protocol.frame_size?;

    // Find sync bytes
    let sync_start = if let Some(sync) = &protocol.sync_bytes {
        if sync.is_empty() {
            0
        } else {
            let pos = acc.windows(sync.len()).position(|w| w == sync.as_slice())?;
            if pos > 0 {
                // Discard garbage before sync (max 1 KiB at a time to avoid stalling)
                let discard = pos.min(1024);
                acc.drain(..discard);
            }
            0
        }
    } else {
        0
    };

    if acc.len() < sync_start + frame_size {
        return None;
    }

    let frame = acc[sync_start..sync_start + frame_size].to_vec();

    // Validate checksum
    if let Some(csum_type) = &protocol.checksum_type {
        if !verify_checksum(&frame, csum_type, protocol.checksum_offset, frame_size) {
            // Bad checksum: skip one byte and let caller retry
            acc.drain(..1);
            return None;
        }
    }

    acc.drain(..sync_start + frame_size);
    Some(frame)
}

fn extract_cobs_frame(acc: &mut Vec<u8>) -> Option<Vec<u8>> {
    let end = acc.iter().position(|&b| b == 0)?;
    let encoded = acc[..end].to_vec();
    acc.drain(..=end);
    cobs_decode(&encoded)
}

// ── Checksum helpers ────────────────────────────────────────────────────────

fn verify_checksum(
    frame: &[u8],
    kind: &ChecksumType,
    offset: Option<usize>,
    frame_size: usize,
) -> bool {
    match kind {
        ChecksumType::None => true,
        ChecksumType::Xor => {
            let off = offset.unwrap_or(frame_size - 1);
            if off >= frame.len() {
                return false;
            }
            let expected = frame[off];
            let computed: u8 = frame[..off].iter().fold(0u8, |a, &b| a ^ b);
            expected == computed
        }
        ChecksumType::Crc8 => {
            let off = offset.unwrap_or(frame_size - 1);
            if off >= frame.len() {
                return false;
            }
            frame[off] == crc8(&frame[..off])
        }
        ChecksumType::Crc16 => {
            let off = offset.unwrap_or(frame_size - 2);
            if off + 1 >= frame.len() {
                return false;
            }
            let expected = u16::from_le_bytes([frame[off], frame[off + 1]]);
            crc16_ccitt(&frame[..off]) == expected
        }
    }
}

fn crc8(data: &[u8]) -> u8 {
    let mut crc: u8 = 0;
    for &byte in data {
        crc ^= byte;
        for _ in 0..8 {
            crc = if crc & 0x80 != 0 { (crc << 1) ^ 0x07 } else { crc << 1 };
        }
    }
    crc
}

fn crc16_ccitt(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
}

fn cobs_decode(encoded: &[u8]) -> Option<Vec<u8>> {
    let mut decoded = Vec::new();
    let mut i = 0;
    while i < encoded.len() {
        let code = encoded[i] as usize;
        if code == 0 {
            break;
        }
        i += 1;
        if i + code - 1 > encoded.len() {
            return None;
        }
        decoded.extend_from_slice(&encoded[i..i + code - 1]);
        i += code - 1;
        if code != 0xFF {
            decoded.push(0);
        }
    }
    // Strip the trailing implicit zero (packet terminator, not data)
    if decoded.last() == Some(&0) {
        decoded.pop();
    }
    Some(decoded)
}

// ── Packet decoding ─────────────────────────────────────────────────────────

/// Decode a raw frame into a JSON telemetry packet.
/// `src_id` is injected as the `src` field.
pub fn decode_packet(
    frame: &[u8],
    protocol: &Protocol,
    src_id: &str,
) -> Option<serde_json::Value> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut obj = match protocol.protocol_type {
        ProtocolType::Binary | ProtocolType::Cobs => decode_binary(frame, protocol)?,
        ProtocolType::Csv => decode_csv(frame, protocol)?,
        ProtocolType::Json => decode_json(frame)?,
    };

    let map = obj.as_object_mut()?;

    // Inject metadata
    map.entry("src").or_insert_with(|| serde_json::json!(src_id));
    map.entry("rcvTs").or_insert_with(|| serde_json::json!(now_ms));
    map.entry("ts").or_insert_with(|| serde_json::json!(now_ms));
    map.entry("seq").or_insert_with(|| serde_json::json!(0u32));

    // Map state integer → string label
    if let Some(state_val) = map
        .get("state")
        .and_then(|v| v.as_u64().or_else(|| {
            v.as_f64().and_then(|f| {
                if f.is_finite() && f.fract() == 0.0 && f >= 0.0 {
                    Some(f as u64)
                } else {
                    None
                }
            })
        }))
    {
        let label = match state_val {
            0 => "IDLE",
            1 => "PAD",
            2 => "BOOST",
            3 => "COAST",
            4 => "APOGEE",
            5 => "DESCENT",
            6 => "LANDED",
            _ => "UNKNOWN",
        };
        map.insert("state".to_string(), serde_json::json!(label));
    }

    Some(obj)
}

fn decode_binary(frame: &[u8], protocol: &Protocol) -> Option<serde_json::Value> {
    let le = matches!(protocol.endian, Endian::Little);
    let mut map = serde_json::Map::new();

    for field in &protocol.fields {
        if field.name.starts_with('_') {
            continue;
        }
        let off = field.offset;
        let mut value: f64 = match field.field_type {
            FieldType::Uint8 => *frame.get(off)? as f64,
            FieldType::Uint16 => {
                let b: [u8; 2] = frame.get(off..off + 2)?.try_into().ok()?;
                (if le { u16::from_le_bytes(b) } else { u16::from_be_bytes(b) }) as f64
            }
            FieldType::Uint32 => {
                let b: [u8; 4] = frame.get(off..off + 4)?.try_into().ok()?;
                (if le { u32::from_le_bytes(b) } else { u32::from_be_bytes(b) }) as f64
            }
            FieldType::Int8 => *frame.get(off)? as i8 as f64,
            FieldType::Int16 => {
                let b: [u8; 2] = frame.get(off..off + 2)?.try_into().ok()?;
                (if le { i16::from_le_bytes(b) } else { i16::from_be_bytes(b) }) as f64
            }
            FieldType::Int32 => {
                let b: [u8; 4] = frame.get(off..off + 4)?.try_into().ok()?;
                (if le { i32::from_le_bytes(b) } else { i32::from_be_bytes(b) }) as f64
            }
            FieldType::Float32 => {
                let b: [u8; 4] = frame.get(off..off + 4)?.try_into().ok()?;
                let bits = if le { u32::from_le_bytes(b) } else { u32::from_be_bytes(b) };
                f32::from_bits(bits) as f64
            }
            FieldType::Float64 => {
                let b: [u8; 8] = frame.get(off..off + 8)?.try_into().ok()?;
                let bits = if le { u64::from_le_bytes(b) } else { u64::from_be_bytes(b) };
                f64::from_bits(bits)
            }
            FieldType::Bool => {
                let raw = *frame.get(off)?;
                map.insert(field.name.clone(), serde_json::Value::Bool(raw != 0));
                continue;
            }
        };

        if let Some(scale) = field.scale {
            value *= scale;
        }
        if let Some(bias) = field.bias {
            value += bias;
        }
        map.insert(field.name.clone(), serde_json::json!(value));
    }

    if map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(map))
    }
}

fn decode_csv(frame: &[u8], protocol: &Protocol) -> Option<serde_json::Value> {
    let line = std::str::from_utf8(frame).ok()?;
    let delim = protocol.delimiter.as_deref().unwrap_or(",");
    let parts: Vec<&str> = line.split(delim).collect();
    let csv_fields = protocol.csv_fields.as_ref()?;

    let mut map = serde_json::Map::new();
    for (i, field_name) in csv_fields.iter().enumerate() {
        let raw = parts.get(i).copied().unwrap_or("").trim();
        if field_name.starts_with('_') {
            continue;
        }
        if let Ok(v) = raw.parse::<f64>() {
            map.insert(field_name.clone(), serde_json::json!(v));
        } else {
            map.insert(
                field_name.clone(),
                match raw {
                    "true" | "1" => serde_json::Value::Bool(true),
                    "false" | "0" => serde_json::Value::Bool(false),
                    other => serde_json::Value::String(other.to_string()),
                },
            );
        }
    }

    if map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(map))
    }
}

fn decode_json(frame: &[u8]) -> Option<serde_json::Value> {
    let line = std::str::from_utf8(frame).ok()?;
    serde_json::from_str(line).ok()
}
