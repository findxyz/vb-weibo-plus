use axum::Router;
use std::path::Path;
use tower_http::services::ServeDir;

pub fn configure<S>(router: Router<S>, frontend_dir: &Path) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    #[cfg(feature = "embed-frontend")]
    if frontend_dir.as_os_str().is_empty() {
        return router.fallback_service(axum::routing::get(embedded_file));
    }
    let files = ServeDir::new(frontend_dir);
    router.fallback_service(files)
}

#[cfg(feature = "embed-frontend")]
#[derive(rust_embed::RustEmbed)]
#[folder = "../../frontend/dist"]
struct Frontend;

#[cfg(feature = "embed-frontend")]
async fn embedded_file(uri: axum::http::Uri) -> axum::response::Response {
    use axum::http::{StatusCode, header};
    use axum::response::IntoResponse;

    let path = uri.path().trim_start_matches('/');
    let path = if path.ends_with('/') {
        format!("{path}index.html")
    } else {
        path.to_owned()
    };
    let Some(file) = Frontend::get(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let content_type = mime_guess::from_path(path).first_or_octet_stream();
    ([(header::CONTENT_TYPE, content_type.as_ref())], file.data).into_response()
}
