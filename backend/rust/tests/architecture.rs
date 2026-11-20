use std::collections::BTreeSet;

use syn::{Ident, ItemMod, ItemUse, Path, UseTree, visit::Visit};

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

    fn visit_path(&mut self, path: &'ast Path) {
        let mut segments = path.segments.iter();
        if let Some(root) = segments.next() {
            self.check(&root.ident, segments.next().map(|segment| &segment.ident));
        }
        syn::visit::visit_path(self, path);
    }
}
