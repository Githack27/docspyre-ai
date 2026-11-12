/// Product code on the DETQEL License Portal, used in the update check URL.
pub const UPDATE_PRODUCT_CODE: &str = "docspyre";
/// The License Portal API. Set DETQEL_UPDATE_SERVER_URL when building to point release builds at the
/// production HTTPS address; plain HTTP is accepted only for this machine.
pub const UPDATE_SERVER_URL: &str = match option_env!("DETQEL_UPDATE_SERVER_URL") {
    Some(url) => url,
    None => "http://127.0.0.1:3012",
};
/// The first startup step. Owned by the native shell, never reported by the backend.
pub const UPDATE_STEP: &str = "software-update";
pub const UPDATE_STEP_LABEL: &str = "Software update";
pub const UPDATE_INSTALL_COMMAND: &str = "update_install";
pub const UPDATE_SKIP_COMMAND: &str = "update_skip";
/// Startup never waits longer than this for the update server; the app then opens as it is.
pub const UPDATE_CHECK_TIMEOUT_SECONDS: u64 = 180;
/// Upper bound for downloading an accepted update, generous enough for slow connections.
pub const UPDATE_DOWNLOAD_TIMEOUT_SECONDS: u64 = 60 * 60;
