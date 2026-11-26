use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use syn::{Ident, ItemMod, ItemUse, Path as SynPath, UseTree, visit::Visit};

#[test]
fn storage_and_configuration_keep_their_dependency_boundaries() {
    let layers = [
        ("config", include_str!("../src/config.rs"), &[][..]),
        ("credential", include_str!("../src/credential.rs"), &[][..]),
        ("db", include_str!("../src/db.rs"), &[][..]),
        ("shanghai", include_str!("../src/shanghai.rs"), &[][..]),
        (
            "chat::store",
            include_str!("../src/chat/store.rs"),
            &["CursorQuery", "MessageQuery", "empty_group", "string"][..],
        ),
    ];

    let mut violations = Vec::new();
    for (module, source, parent_items) in layers {
        let file = syn::parse_file(source).unwrap();
        let mut visitor = Boundary {
            parent_items,
            forbidden: BTreeSet::new(),
        };
        visitor.visit_file(&file);
        violations.extend(
            visitor
                .forbidden
                .into_iter()
                .map(|path| format!("{module} must not depend on {path}")),
        );
    }

    assert!(violations.is_empty(), "{}", violations.join("\n"));
}

#[test]
fn infrastructure_and_feature_modules_keep_their_boundaries() {
    let rules: &[(&str, &str, &[&str])] = &[
        (
            "weibo",
            include_str!("../src/weibo.rs"),
            &[
                "analysis",
                "chat",
                "login",
                "media",
                "openapi",
                "post",
                "static_files",
            ],
        ),
        (
            "static_files",
            include_str!("../src/static_files.rs"),
            &[
                "analysis",
                "chat",
                "config",
                "credential",
                "db",
                "login",
                "media",
                "openapi",
                "post",
                "shanghai",
                "weibo",
            ],
        ),
        (
            "openapi",
            include_str!("../src/openapi.rs"),
            &[
                "analysis",
                "chat",
                "credential",
                "db",
                "login",
                "media",
                "post",
                "shanghai",
                "static_files",
                "weibo",
            ],
        ),
        (
            "analysis",
            include_str!("../src/analysis.rs"),
            &[
                "chat",
                "login",
                "media",
                "openapi",
                "post",
                "static_files",
                "weibo",
            ],
        ),
        (
            "login",
            include_str!("../src/login.rs"),
            &[
                "analysis",
                "chat",
                "media",
                "openapi",
                "post",
                "static_files",
            ],
        ),
        (
            "post",
            include_str!("../src/post.rs"),
            &[
                "analysis",
                "chat",
                "login",
                "media",
                "openapi",
                "static_files",
            ],
        ),
        (
            "chat",
            include_str!("../src/chat.rs"),
            &["analysis", "login", "media", "openapi", "static_files"],
        ),
        (
            "chat::capture",
            include_str!("../src/chat/capture.rs"),
            &["analysis", "login", "media", "openapi", "static_files"],
        ),
        (
            "chat::push",
            include_str!("../src/chat/push.rs"),
            &[
                "analysis",
                "login",
                "media",
                "openapi",
                "post",
                "static_files",
            ],
        ),
    ];

    let mut violations = Vec::new();
    for (module, source, denied) in rules {
        let file = syn::parse_file(source).unwrap();
        let mut visitor = ModuleBoundary {
            denied,
            forbidden: BTreeSet::new(),
        };
        visitor.visit_file(&file);
        violations.extend(
            visitor
                .forbidden
                .into_iter()
                .map(|path| format!("{module} must not depend on {path}")),
        );
    }

    assert!(violations.is_empty(), "{}", violations.join("\n"));
}

#[test]
fn production_sources_do_not_contain_comments() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut violations = Vec::new();
    check_comments_in_dir(&src_dir, &src_dir, &mut violations);
    assert!(
        violations.is_empty(),
        "comments are not allowed in Rust production sources:\n{}",
        violations.join("\n")
    );
}

fn check_comments_in_dir(root: &Path, dir: &Path, violations: &mut Vec<String>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            check_comments_in_dir(root, &path, violations);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("rs") {
            let source = fs::read_to_string(&path).unwrap();
            let rel = path.strip_prefix(root).unwrap().display();
            for line in find_comment_lines(&source) {
                violations.push(format!("src/{rel}:{line}"));
            }
        }
    }
}

fn find_comment_lines(source: &str) -> Vec<usize> {
    let bytes = source.as_bytes();
    let mut lines = Vec::new();
    let mut i = 0;
    let mut line = 1;

    while i < bytes.len() {
        match bytes[i] {
            b'\n' => {
                line += 1;
                i += 1;
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'/' => {
                lines.push(line);
                i += 2;
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'*' => {
                lines.push(line);
                i += 2;
                let mut depth = 1usize;
                while i < bytes.len() && depth > 0 {
                    if bytes[i] == b'\n' {
                        line += 1;
                        i += 1;
                    } else if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'*' {
                        depth += 1;
                        i += 2;
                    } else if i + 1 < bytes.len() && bytes[i] == b'*' && bytes[i + 1] == b'/' {
                        depth -= 1;
                        i += 2;
                    } else {
                        i += 1;
                    }
                }
            }
            b'r' | b'b' => {
                if let Some((next_i, added_lines)) = skip_raw_string(bytes, i) {
                    i = next_i;
                    line += added_lines;
                } else {
                    i += 1;
                }
            }
            b'"' => {
                let (next_i, added_lines) = skip_quoted_string(bytes, i + 1);
                i = next_i;
                line += added_lines;
            }
            b'\'' => {
                if let Some(next_i) = skip_char_literal(bytes, i) {
                    i = next_i;
                } else {
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }

    lines
}

fn skip_quoted_string(bytes: &[u8], mut i: usize) -> (usize, usize) {
    let mut added_lines = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                if i + 1 < bytes.len() {
                    if bytes[i + 1] == b'\n' {
                        added_lines += 1;
                    }
                    i += 2;
                } else {
                    i += 1;
                }
            }
            b'"' => return (i + 1, added_lines),
            b'\n' => {
                added_lines += 1;
                i += 1;
            }
            _ => i += 1,
        }
    }
    (i, added_lines)
}

fn skip_raw_string(bytes: &[u8], start: usize) -> Option<(usize, usize)> {
    let mut i = start;
    if bytes[i] == b'b' {
        i += 1;
        if i >= bytes.len() || bytes[i] != b'r' {
            return None;
        }
    }
    if bytes[i] != b'r' {
        return None;
    }
    if start > 0 && (bytes[start - 1].is_ascii_alphanumeric() || bytes[start - 1] == b'_') {
        return None;
    }
    i += 1;
    let mut hashes = 0;
    while i < bytes.len() && bytes[i] == b'#' {
        hashes += 1;
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b'"' {
        return None;
    }
    i += 1;
    let mut added_lines = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            added_lines += 1;
            i += 1;
            continue;
        }
        if bytes[i] == b'"' {
            let mut matched = 0;
            while matched < hashes
                && i + 1 + matched < bytes.len()
                && bytes[i + 1 + matched] == b'#'
            {
                matched += 1;
            }
            if matched == hashes {
                return Some((i + 1 + hashes, added_lines));
            }
        }
        i += 1;
    }
    Some((i, added_lines))
}

fn skip_char_literal(bytes: &[u8], start: usize) -> Option<usize> {
    if start + 2 >= bytes.len() {
        return None;
    }
    if bytes[start + 1] == b'\\' {
        let mut i = start + 3;
        while i < bytes.len() && i <= start + 10 {
            if bytes[i] == b'\'' {
                return Some(i + 1);
            }
            if bytes[i] == b'\n' {
                return None;
            }
            i += 1;
        }
        None
    } else if bytes[start + 1] != b'\n' && bytes[start + 2] == b'\'' {
        Some(start + 3)
    } else {
        None
    }
}

struct ModuleBoundary<'a> {
    denied: &'a [&'a str],
    forbidden: BTreeSet<String>,
}

impl ModuleBoundary<'_> {
    fn check(&mut self, root: &Ident, next: Option<&Ident>) {
        let root_name = root.to_string();
        if (root_name == "crate" || root_name == "weibo_plus")
            && let Some(segment) = next
        {
            let segment_name = segment.to_string();
            if self.denied.contains(&segment_name.as_str()) {
                self.forbidden
                    .insert(format!("{root_name}::{segment_name}"));
            }
        }
    }

    fn check_import(&mut self, tree: &UseTree, root: Option<&Ident>) {
        match tree {
            UseTree::Group(group) => {
                for item in &group.items {
                    self.check_import(item, root);
                }
            }
            UseTree::Path(path) => match root {
                Some(root) => self.check(root, Some(&path.ident)),
                None => self.check_import(&path.tree, Some(&path.ident)),
            },
            UseTree::Name(name) => match root {
                Some(root) => self.check(root, Some(&name.ident)),
                None => self.check(&name.ident, None),
            },
            UseTree::Rename(rename) => match root {
                Some(root) => self.check(root, Some(&rename.ident)),
                None => self.check(&rename.ident, None),
            },
            UseTree::Glob(_) => {
                if let Some(root) = root {
                    self.check(root, None);
                }
            }
        }
    }
}

impl<'ast> Visit<'ast> for ModuleBoundary<'_> {
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

    fn visit_item_use(&mut self, item: &'ast ItemUse) {
        self.check_import(&item.tree, None);
    }

    fn visit_visibility(&mut self, _: &'ast syn::Visibility) {}

    fn visit_path(&mut self, path: &'ast SynPath) {
        let mut segments = path.segments.iter();
        if let Some(root) = segments.next() {
            self.check(&root.ident, segments.next().map(|segment| &segment.ident));
        }
        syn::visit::visit_path(self, path);
    }
}

struct Boundary<'a> {
    parent_items: &'a [&'a str],
    forbidden: BTreeSet<String>,
}

impl Boundary<'_> {
    fn check(&mut self, root: &Ident, next: Option<&Ident>) {
        let root = root.to_string();
        match root.as_str() {
            "crate" | "weibo_plus" | "axum" | "tokio_tungstenite" => {}
            "reqwest" if !next.is_some_and(|name| name == "Url") => {}
            "super"
                if !next
                    .map(|name| self.parent_items.contains(&name.to_string().as_str()))
                    .unwrap_or(false) => {}
            _ => return,
        }
        self.forbidden.insert(match next {
            Some(name) => format!("{root}::{name}"),
            None => root,
        });
    }

    fn check_import(&mut self, tree: &UseTree, root: Option<&Ident>) {
        match tree {
            UseTree::Group(group) => {
                for item in &group.items {
                    self.check_import(item, root);
                }
            }
            UseTree::Path(path) => match root {
                Some(root) => self.check(root, Some(&path.ident)),
                None => self.check_import(&path.tree, Some(&path.ident)),
            },
            UseTree::Name(name) => match root {
                Some(root) => self.check(root, Some(&name.ident)),
                None => self.check(&name.ident, None),
            },
            UseTree::Rename(rename) => match root {
                Some(root) => self.check(root, Some(&rename.ident)),
                None => self.check(&rename.ident, None),
            },
            UseTree::Glob(_) => {
                if let Some(root) = root {
                    self.check(root, None);
                }
            }
        }
    }
}

impl<'ast> Visit<'ast> for Boundary<'_> {
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

    fn visit_item_use(&mut self, item: &'ast ItemUse) {
        self.check_import(&item.tree, None);
    }

    fn visit_visibility(&mut self, _: &'ast syn::Visibility) {}

    fn visit_path(&mut self, path: &'ast SynPath) {
        let mut segments = path.segments.iter();
        if let Some(root) = segments.next() {
            self.check(&root.ident, segments.next().map(|segment| &segment.ident));
        }
        syn::visit::visit_path(self, path);
    }
}
