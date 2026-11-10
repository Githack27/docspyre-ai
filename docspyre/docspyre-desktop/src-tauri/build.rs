fn main() {
    println!(
        "cargo:rustc-env=DOCSPYRE_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
