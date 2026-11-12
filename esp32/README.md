# ESP32 keg publishing

The dashboard backend is ready to receive one reading per minute from the keg controller.

## 1. Protect credentials

Keep `secrets.h` beside the sketch and `KegSupabasePublisher.h`. It is ignored by Git. Replace the Wi-Fi password placeholder before flashing. The ingestion secret already matches the deployed Supabase secret.

In the sketch, replace the existing Wi-Fi constants with:

```cpp
#include "secrets.h"
#include "KegSupabasePublisher.h"

const char* WIFI_SSID = WIFI_SSID_VALUE;
const char* WIFI_PASSWORD = WIFI_PASSWORD_VALUE;
KegSupabasePublisher cloudPublisher;
```

## 2. Reuse one JSON builder

Move the JSON construction from `handleKegApi()` into a function:

```cpp
String buildKegJson() {
  String json = "{";
  json += "\"kegName\":\"Shep Shack Tap\",";
  json += "\"ready\":" + String((hxReady && hasSavedTare) ? "true" : "false") + ",";
  json += "\"hxReady\":" + String(hxReady ? "true" : "false") + ",";
  json += "\"hasSavedTare\":" + String(hasSavedTare ? "true" : "false") + ",";
  json += "\"totalWeightLb\":" + String(latestTotalWeightLb, 1) + ",";
  json += "\"beerOz\":" + String(latestBeerOz, 0) + ",";
  json += "\"pintsLeft\":" + String(latestPintsLeft, 1) + ",";
  json += "\"percent\":" + String(latestPercent, 0) + ",";
  json += "\"emptyKegLb\":" + String(emptyKegLb, 1) + ",";
  json += "\"fullVolumeOz\":" + String(FULL_VOLUME_OZ, 0) + ",";
  json += "\"lastUpdateMs\":" + String(latestUpdateMs) + ",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\"";
  json += "}";
  return json;
}

void handleKegApi() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(200, "application/json", buildKegJson());
}
```

## 3. Publish after a successful scale reading

Immediately after `latestUpdateMs = millis();` in `loop()`, add:

```cpp
cloudPublisher.publishIfDue(buildKegJson());
```

The publisher attempts HTTPS once per minute, has six-second timeouts, and leaves the local display and `/keg` endpoint intact if Wi-Fi or Supabase is unavailable.

## 4. Verify

Open Serial Monitor at 115200 baud. A successful upload prints:

```text
Supabase: keg reading uploaded
```

The dashboard will use the newest row from Supabase on the next 30-second refresh.


## Two scales (November 2026)

The cloud now identifies `beer` and `sparkling-water` separately. Add a stable ID to each JSON payload:

```cpp
json += "\"scaleId\":\"sparkling-water\",";
```

The connected second controller's sketch is `Documents/Arduino/keg_scale_wifi/sparking_water_wifi/sparking_water_wifi.ino`. Its saved calibration, empty-keg weight, and current level must be preserved. Do not run `t`, `clear`, or `new` merely to connect it: `t` requires an empty platform and `new` marks the installed keg full.

Existing Beer firmware needs no immediate reflash: uploads without an ID default to `beer`; the existing `Sparkling Water` name also identifies older water firmware. Unknown explicit scale IDs are rejected. An explicit ID takes priority over a changed beverage name.

The `20261112010000_separate_keg_scales.sql` migration preserves data, foreign keys, and household RLS. All scales use `keg_scale_readings`, `keg_scale_pours`, and `keg_scale_changes`, filtered by `scale_id`. The original `keg_readings`, `keg_pours`, and `keg_changes` names are security-invoker Beer-only views, so the previously published app and older ingestion functions remain compatible. Retention covers readings from both scales.

Deploy the migration before the scale-aware `keg-ingest` and `notification-worker` functions. The updated frontend stays local until the dashboard redesign is approved. Its Keg page has Beer and Sparkling Water selectors, with independent levels, history, refill baselines, and pour analytics. Home includes a water summary. Notifications name the correct scale and link to its selected tap.

Validation:

```sh
node --test supabase/functions/keg-ingest/index.test.mjs supabase/functions/notification-worker/keg-scales.test.mjs
npm run lint
npm run build
```

The migration was rehearsed in a rolled-back transaction, including Beer-only compatibility views, water reading/pour/refill separation, household reads, and denial of non-household reads.
