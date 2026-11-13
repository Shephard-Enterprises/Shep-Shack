# Tap name editing

The Kegs page has an Edit name action for Beer and Sparkling Water. Names also appear on Home. Household members can edit the corresponding `keg_scale_settings.display_name`; scale identities are fixed and independent of names.

Names are trimmed, 1–32 printable ASCII characters, matching the CYD's built-in font. The database, app and firmware validate the same boundaries. Quotes and backslashes are JSON-escaped in device readings. Long CYD titles use the smaller font to fit the screen.

Deploy `20261112020000_keg_names.sql` before the updated `keg-ingest` function and dashboard. The function returns the household-owned name in `X-Keg-Name` on an authenticated successful reading upload. A settings read failure leaves normal readings and events working; devices retain their last saved name. Reading payloads keep the device-reported name so the app can show whether the display has synced. Confirmation in the app may take another reading after the display updates.

Apply `beer-keg-name.patch` / `water-keg-name.patch` after the existing pour-detection and OTA patches. Copy `KegNameSettings.h` beside each sketch. Upload each compiled binary to its own controller. The deployed controllers check for names on their existing roughly once-per-minute uploads, save changes only when needed, and load them on restart. A rename changes only `tapName` in the existing `kegscale` / `waterscale` Preferences namespace. It never tares, recalibrates, marks a new keg, or resets pour detection.

Validation includes name boundary/header tests, ingestion scale separation and outage tests, rolled-back production RLS checks, ESP32 compilation for both controllers, desktop/320px name editor checks, and authenticated OTA plus live controller name-sync verification. Credentials remain in the private local sketch headers.
