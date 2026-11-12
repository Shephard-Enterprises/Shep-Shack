#pragma once

#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

class KegSupabasePublisher {
public:
  static constexpr unsigned long PUBLISH_INTERVAL_MS = 60000;

  bool publishIfDue(const String& payload, bool force = false) {
    if (WiFi.status() != WL_CONNECTED) return false;
    const unsigned long now = millis();
    if (!force && lastAttemptMs_ != 0 && now - lastAttemptMs_ < PUBLISH_INTERVAL_MS) return false;
    lastAttemptMs_ = now;

    WiFiClientSecure client;
    client.setInsecure(); // TLS transport is encrypted; ESP32 skips CA bundle management.

    HTTPClient http;
    http.setConnectTimeout(6000);
    http.setTimeout(6000);
    if (!http.begin(client, ENDPOINT)) {
      Serial.println("Supabase: could not start HTTPS request");
      return false;
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-keg-secret", KEG_INGEST_SECRET_VALUE);
    const int status = http.POST(payload);
    http.end();

    if (status >= 200 && status < 300) {
      lastSuccessMs_ = now;
      Serial.println("Supabase: keg reading uploaded");
      return true;
    }

    Serial.print("Supabase upload failed, HTTP ");
    Serial.println(status);
    return false;
  }

  unsigned long lastSuccessMs() const { return lastSuccessMs_; }

private:
  static constexpr const char* ENDPOINT =
    "https://rczekdcyzoixvxpyrcjs.supabase.co/functions/v1/keg-ingest";
  unsigned long lastAttemptMs_ = 0;
  unsigned long lastSuccessMs_ = 0;
};
