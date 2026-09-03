/**
 * App version, injected at build time from package.json (see vite.config.ts).
 * package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml must be
 * bumped together — this reads the first so the UI can never drift from it.
 */
export const APP_VERSION = __APP_VERSION__;

/** Display form, e.g. "v0.1.3". */
export const APP_VERSION_LABEL = `v${__APP_VERSION__}`;
