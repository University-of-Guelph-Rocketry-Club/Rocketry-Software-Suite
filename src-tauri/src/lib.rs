mod commands;
mod protocol;
mod serial_bridge;

use commands::{get_app_data_dir, list_sessions, load_schema, load_session, save_session};
use serial_bridge::{close_serial_port, list_serial_ports, open_serial_port, SerialState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SerialState::new())
        .invoke_handler(tauri::generate_handler![
            load_schema,
            save_session,
            load_session,
            get_app_data_dir,
            list_sessions,
            list_serial_ports,
            open_serial_port,
            close_serial_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
