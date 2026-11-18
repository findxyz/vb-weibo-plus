use std::sync::Arc;

use axum::extract::Path;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use crate::{AppState, Config};

pub(crate) fn routes(config: &Config) -> Router<AppState> {
    let mut router = Router::new();
    if config.openapi_enabled {
        router = router.route("/v3/api-docs", get(document));
    }
    if config.swagger_ui_enabled {
        router = router
            .route("/v3/api-docs/swagger-config", get(swagger_config))
            .route("/swagger-ui.html", get(swagger_redirect))
            .route("/swagger-ui/", get(swagger_redirect))
            .route("/swagger-ui/{*asset}", get(swagger_ui));
    }
    router
}

async fn document() -> Response {
    (
        [(header::CONTENT_TYPE, "application/json")],
        include_str!("openapi.json"),
    )
        .into_response()
}

async fn swagger_config() -> Json<serde_json::Value> {
    Json(json!({
        "configUrl": "/v3/api-docs/swagger-config",
        "url": "/v3/api-docs",
        "oauth2RedirectUrl": "/swagger-ui/oauth2-redirect.html"
    }))
}

async fn swagger_redirect() -> Redirect {
    Redirect::temporary("/swagger-ui/index.html")
}

async fn swagger_ui(Path(asset): Path<String>) -> Response {
    let config = Arc::new(utoipa_swagger_ui::Config::new(["/v3/api-docs"]));
    match utoipa_swagger_ui::serve(&asset, config) {
        Ok(Some(file)) => (
            [(header::CONTENT_TYPE, file.content_type)],
            file.bytes.into_owned(),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
