use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionFile {
    pub name: String,
    pub packets: serde_json::Value,
    pub notes: Option<serde_json::Value>,
}

/// Read a JSON schema file from disk
#[tauri::command]
pub fn load_schema(path: String) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read schema: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON schema: {e}"))
}

/// Save a replay session to disk
#[tauri::command]
pub fn save_session(path: String, session: SessionFile) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Serialization error: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write session: {e}"))
}

/// Load a replay session from disk
#[tauri::command]
pub fn load_session(path: String) -> Result<SessionFile, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Invalid session file: {e}"))
}

/// Get app data directory path
#[tauri::command]
pub fn get_app_data_dir(app_handle: AppHandle) -> Result<String, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|p: PathBuf| p.to_string_lossy().to_string())
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))
}

/// List saved sessions in the app data directory
#[tauri::command]
pub fn list_sessions(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let sessions_dir = dir.join("sessions");
    if !sessions_dir.exists() {
        fs::create_dir_all(&sessions_dir)
            .map_err(|e| format!("Cannot create sessions dir: {e}"))?;
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Cannot read sessions dir: {e}"))?;

    let mut files = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Some(name) = path.to_str() {
                files.push(name.to_string());
            }
        }
    }
    files.sort();
    Ok(files)
}
