#pragma once
#include <Arduino.h>
#include <Preferences.h>

// Cloud-owned label only. Never modifies scale calibration or full-keg state.
class KegNameSettings {
public:
  explicit KegNameSettings(const char *fallback) : value_(fallback) {}
  const String &value() const { return value_; }
  static bool valid(const String &name) {
    if (name.length() < 1 || name.length() > 32 || name[0] == ' ' || name[name.length() - 1] == ' ') return false;
    for (unsigned int i = 0; i < name.length(); ++i) {
      if (name[i] < 32 || name[i] > 126) return false;
    }
    return true;
  }
  // Called while the sketch's existing Preferences namespace is open.
  void load(Preferences &prefs) {
    String saved = prefs.getString("tapName", value_);
    if (valid(saved)) value_ = saved;
  }
  bool apply(const String &name, const char *settingsNamespace) {
    if (!valid(name) || name == value_) return false;
    Preferences settings;
    if (!settings.begin(settingsNamespace, false)) return false;
    const bool saved = settings.putString("tapName", name) == name.length();
    settings.end();
    if (saved) value_ = name;
    return saved;
  }
  String json() const {
    String result = "\"";
    for (unsigned int i = 0; i < value_.length(); ++i) {
      if (value_[i] == '"' || value_[i] == '\\') result += '\\';
      result += value_[i];
    }
    return result + "\"";
  }
private:
  String value_;
};
