//! Windows drag entry point. Avoid the runtime's swallowed ReleaseCapture errors
//! and its pointer-valued WM_NCLBUTTONDOWN lParam (Win32 expects packed coordinates).

#[tauri::command]
pub async fn start_window_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let (tx, mut rx) = tauri::async_runtime::channel(1);
        window.run_on_main_thread(move || {
            let result = unsafe { drag_window(hwnd) };
            // Send only after SendMessageW's modal move loop has ended.
            let _ = tx.try_send(result);
        }).map_err(|e| e.to_string())?;
        rx.recv().await.ok_or_else(|| "Window drag did not complete".to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    window.start_dragging().map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
unsafe fn drag_window(hwnd: isize) -> Result<(), String> {
    // IPC may arrive after a quick click has already ended.
    if GetAsyncKeyState(0x01) >= 0 {
        return Ok(());
    }
    let mut point = Point { x: 0, y: 0 };
    if GetCursorPos(&mut point) == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // Having no existing mouse capture is valid; do not abort the drag.
    let _ = ReleaseCapture();
    SendMessageW(hwnd, 0x00A1, 2, pack_point(point.x, point.y));
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn pack_point(x: i32, y: i32) -> isize {
    ((x as u16 as u32) | ((y as u16 as u32) << 16)) as isize
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct Point {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetAsyncKeyState(key: i32) -> i16;
    fn GetCursorPos(point: *mut Point) -> i32;
    fn ReleaseCapture() -> i32;
    fn SendMessageW(hwnd: isize, message: u32, wparam: usize, lparam: isize) -> isize;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drag_message_carries_coordinates_instead_of_a_pointer() {
        for (x, y) in [(500, 300), (-1200, 400), (800, -600), (-1920, -1080)] {
            let packed = pack_point(x, y);
            assert_eq!(packed as u16 as i16 as i32, x);
            assert_eq!((packed >> 16) as u16 as i16 as i32, y);
        }
    }
}
