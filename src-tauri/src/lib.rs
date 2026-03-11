mod commands;

use commands::{get_app_data_dir, list_sessions, load_schema, load_session, save_session};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_schema,
            save_session,
            load_session,
            get_app_data_dir,
            list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
