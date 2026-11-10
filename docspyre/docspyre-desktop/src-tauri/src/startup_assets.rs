use crate::constants::{
    desktop_constants::{LOGO_DARK, LOGO_LIGHT, NAME_LOGO_DARK, NAME_LOGO_LIGHT, STARTUP_PAGE},
    frontend_constants::STARTUP_ASSET_CSP,
};
use tauri::http::{header, HeaderValue, Request, Response, StatusCode};

/// The loader is compiled into the executable and never depends on the frontend dev server or API.
pub fn respond(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let path = request.uri().path();
    let asset: Option<(&'static str, &[u8])> = match path {
        path if path == format!("/{STARTUP_PAGE}") => Some((
            "text/html; charset=utf-8",
            include_bytes!("../../frontend/public/desktop-startup.html"),
        )),
        path if path == LOGO_LIGHT || path == LOGO_DARK || path == NAME_LOGO_LIGHT || path == NAME_LOGO_DARK => Some((
            "image/png",
            include_bytes!("../../frontend/public/images/docspyre-logo.png"),
        )),
        _ => None,
    };
    let mut response = Response::new(asset.map(|(_, data)| data.to_vec()).unwrap_or_default());
    if let Some((content_type, _)) = asset {
        response
            .headers_mut()
            .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    } else {
        *response.status_mut() = StatusCode::NOT_FOUND;
    }
    response.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(STARTUP_ASSET_CSP),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}
