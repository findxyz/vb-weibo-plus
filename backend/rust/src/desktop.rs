use std::{env, mem::size_of, path::PathBuf, ptr};

use reqwest::Url;
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    platform::{
        run_return::EventLoopExtRunReturn,
        windows::{IconExtWindows, WindowBuilderExtWindows, WindowExtWindows},
    },
    window::{Icon, Window, WindowBuilder},
};
use windows_sys::Win32::{
    Graphics::Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow},
    UI::WindowsAndMessaging::{
        MB_ICONERROR, MessageBoxW, SWP_NOACTIVATE, SWP_NOZORDER, SetWindowPos,
    },
};
use wry::{NewWindowResponse, WebContext, WebViewBuilder, WebViewBuilderExtWindows};

pub fn run(url: &str) -> Result<(), Box<dyn std::error::Error>> {
    let origin = Url::parse(url)?.origin();
    let page_origin = serde_json::to_string(&origin.ascii_serialization())?;
    let navigate = move |url: String| {
        let Ok(url) = Url::parse(&url) else {
            return false;
        };
        if url.origin() == origin {
            return true;
        }
        if matches!(url.scheme(), "http" | "https") {
            super::open_default_browser(url.as_str());
        }
        false
    };

    let mut event_loop = EventLoopBuilder::<PathBuf>::with_user_event().build();
    let download_events = event_loop.create_proxy();
    let icon = Icon::from_resource(1, None)?;
    let window = WindowBuilder::new()
        .with_title("Weibo Plus - https://github.com/findxyz/vb-weibo-plus")
        .with_inner_size(LogicalSize::new(1280, 850))
        .with_window_icon(Some(icon.clone()))
        .with_taskbar_icon(Some(icon))
        .with_visible(false)
        .build(&event_loop)?;
    let profile = env::var_os("LOCALAPPDATA")
        .map(|path| PathBuf::from(path).join("Weibo Plus").join("WebView2"));
    let mut context = WebContext::new(profile);
    let webview = WebViewBuilder::new_with_web_context(&mut context)
        .with_url(url)
        .with_additional_browser_args("")
        .with_navigation_handler(navigate.clone())
        .with_new_window_req_handler(move |url, _| {
            if navigate(url) {
                NewWindowResponse::Allow
            } else {
                NewWindowResponse::Deny
            }
        })
        .with_download_completed_handler(move |_, path, success| {
            if success && let Some(path) = path {
                let _ = download_events.send_event(path);
            }
        })
        .build(&window)
        .map_err(|error| {
            format!("无法创建 WebView2 窗口，请检查 Microsoft Edge WebView2 运行时。\n{error}")
        })?;
    center_window(&window);
    window.set_visible(true);
    let mut minimized = false;
    event_loop.run_return(|event, _, control_flow| match event {
        Event::UserEvent(path) => {
            if let Ok(path) = serde_json::to_string(&path.to_string_lossy()) {
                let _ = webview.evaluate_script(&format!(
                    "if (location.origin === {page_origin}) {{
                        window.dispatchEvent(new CustomEvent('desktop-download-complete', {{ detail: {path} }}));
                    }}"
                ));
            }
        }
        Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } => *control_flow = ControlFlow::Exit,
        Event::WindowEvent {
            event: WindowEvent::Resized(_),
            ..
        } => {
            let next_minimized = window.is_minimized();
            if minimized != next_minimized {
                minimized = next_minimized;
                let _ = webview.set_visible(!minimized);
            }
        }
        _ => {}
    });
    Ok(())
}

fn center_window(window: &Window) {
    let hwnd = window.hwnd() as _;
    let mut monitor_info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if unsafe { GetMonitorInfoW(monitor, &mut monitor_info) } == 0 {
        return;
    }
    let area = monitor_info.rcWork;
    let available_width = area.right - area.left;
    let available_height = area.bottom - area.top;
    let size = window.outer_size();
    let width = (size.width as i32).min(available_width);
    let height = (size.height as i32).min(available_height);
    let x = area.left + (available_width - width) / 2;
    let y = area.top + (available_height - height) / 2;
    unsafe {
        SetWindowPos(
            hwnd,
            ptr::null_mut(),
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
    };
}

pub fn show_error(error: &str) {
    let text: Vec<u16> = error.encode_utf16().chain([0]).collect();
    let title: Vec<u16> = "Weibo Plus".encode_utf16().chain([0]).collect();
    unsafe { MessageBoxW(ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_ICONERROR) };
}
