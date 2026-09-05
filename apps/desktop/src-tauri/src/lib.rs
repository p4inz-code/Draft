/// Reports the `draft-core` version, proving both the Tauri IPC round-trip
/// and the Rust workspace wiring (desktop -> crates/) work end to end.
#[tauri::command]
fn app_version() -> String {
    draft_core::CORE_VERSION.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
