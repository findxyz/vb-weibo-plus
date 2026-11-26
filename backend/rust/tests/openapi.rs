use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use syn::visit::Visit;
use syn::{Expr, ExprMethodCall, Ident, ItemMod, Lit};
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

#[tokio::test]
async fn swagger_is_opt_in_and_documents_the_browser_api() {
    let temp = tempfile::tempdir().unwrap();
    let mut config = Config {
        database_path: temp.path().join("java.db"),
        cookie_file: temp.path().join(".weibo_cookie.txt"),
        ..Config::default()
    };
    let request = |uri| Request::builder().uri(uri).body(Body::empty()).unwrap();
    let default_app = app(AppState::new(config.clone()).await.unwrap());
    let response = default_app.oneshot(request("/v3/api-docs")).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    config.openapi_enabled = true;
    config.swagger_ui_enabled = true;
    let router = app(AppState::new(config).await.unwrap());
    let docs = router
        .clone()
        .oneshot(request("/v3/api-docs"))
        .await
        .unwrap();
    assert_eq!(docs.status(), StatusCode::OK);
    let docs = axum::body::to_bytes(docs.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let schema: serde_json::Value = serde_json::from_slice(&docs).unwrap();
    assert_eq!(schema["info"]["title"], "vb-weibo-plus");
    assert!(schema["paths"]["/post/list"].is_object());
    assert!(schema["paths"]["/chat/messages"].is_object());
    assert!(schema["paths"]["/weibo/blog/mymblog"].is_null());

    let link = router
        .clone()
        .oneshot(request("/swagger-ui.html"))
        .await
        .unwrap();
    assert_eq!(link.headers()[header::LOCATION], "/swagger-ui/index.html");
    let page = router
        .oneshot(request("/swagger-ui/index.html"))
        .await
        .unwrap();
    assert_eq!(page.status(), StatusCode::OK);
}

#[test]
fn browser_routes_match_openapi_contract() {
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../openapi.json")).unwrap();
    let mut contract_routes = BTreeSet::new();
    for (path, item) in schema["paths"].as_object().unwrap() {
        for method in item.as_object().unwrap().keys() {
            contract_routes.insert((method.to_ascii_uppercase(), path.clone()));
        }
    }

    let mut rust_routes = BTreeSet::new();
    collect_routes(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
        &mut rust_routes,
    );

    let missing_in_rust: Vec<_> = contract_routes.difference(&rust_routes).collect();
    let undocumented_in_openapi: Vec<_> = rust_routes.difference(&contract_routes).collect();
    assert!(
        missing_in_rust.is_empty() && undocumented_in_openapi.is_empty(),
        "OpenAPI route mismatch:\nmissing in Rust: {missing_in_rust:?}\nundocumented in openapi.json: {undocumented_in_openapi:?}"
    );
}

fn collect_routes(dir: &Path, routes: &mut BTreeSet<(String, String)>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect_routes(&path, routes);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("rs") {
            let source = fs::read_to_string(&path).unwrap();
            let file = syn::parse_file(&source).unwrap();
            let mut collector = RouteCollector { routes };
            collector.visit_file(&file);
        }
    }
}

struct RouteCollector<'a> {
    routes: &'a mut BTreeSet<(String, String)>,
}

impl<'ast> Visit<'ast> for RouteCollector<'_> {
    fn visit_item_mod(&mut self, module: &'ast ItemMod) {
        let test_module = module.attrs.iter().any(|attribute| {
            attribute.path().is_ident("cfg")
                && attribute
                    .parse_args::<Ident>()
                    .is_ok_and(|condition| condition == "test")
        });
        if !test_module {
            syn::visit::visit_item_mod(self, module);
        }
    }

    fn visit_expr_method_call(&mut self, call: &'ast ExprMethodCall) {
        if call.method == "route"
            && call.args.len() == 2
            && let Some(path) = string_literal(&call.args[0])
            && (path.starts_with("/post/") || path.starts_with("/chat/"))
        {
            let mut methods = BTreeSet::new();
            collect_http_methods(&call.args[1], &mut methods);
            assert!(
                !methods.is_empty(),
                "route {path} did not resolve any HTTP methods"
            );
            for method in methods {
                self.routes.insert((method, path.clone()));
            }
        }
        syn::visit::visit_expr_method_call(self, call);
    }
}

fn string_literal(expr: &Expr) -> Option<String> {
    let Expr::Lit(lit) = expr else {
        return None;
    };
    let Lit::Str(value) = &lit.lit else {
        return None;
    };
    Some(value.value())
}

fn collect_http_methods(expr: &Expr, methods: &mut BTreeSet<String>) {
    match expr {
        Expr::Call(call) => {
            if let Expr::Path(path) = call.func.as_ref()
                && let Some(segment) = path.path.segments.last()
                && let Some(method) = http_method(&segment.ident.to_string())
            {
                methods.insert(method.to_string());
            }
        }
        Expr::MethodCall(call) => {
            if let Some(method) = http_method(&call.method.to_string()) {
                methods.insert(method.to_string());
            }
            collect_http_methods(&call.receiver, methods);
        }
        Expr::Paren(paren) => collect_http_methods(&paren.expr, methods),
        Expr::Group(group) => collect_http_methods(&group.expr, methods),
        _ => {}
    }
}

fn http_method(name: &str) -> Option<&'static str> {
    match name {
        "get" => Some("GET"),
        "post" => Some("POST"),
        "put" => Some("PUT"),
        "delete" => Some("DELETE"),
        "patch" => Some("PATCH"),
        "head" => Some("HEAD"),
        "options" => Some("OPTIONS"),
        _ => None,
    }
}
