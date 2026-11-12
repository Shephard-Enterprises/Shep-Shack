# Retro dashboard integration

The approved Shep Shack design is integrated into the existing React dashboard.

- Home uses existing sports, keg, aircraft, weather, and environmental feeds. No extra household devices or sample readings are added.
- Flight radar supports aircraft selection, search, sorting, view range, type illustrations, and enlarged artwork. Feed coverage remains unchanged. Unknown types have an explicit placeholder; the H-53 illustration identifies its subtype uncertainty.
- Sports retains the original standings, scorers, recaps, and game details in expandable rows.
- Original keg analytics, Weather radar, Safety maps/notices, Settings, notifications, authentication, and API hooks remain connected.
- Mobile layout, keyboard focus, manual refresh, history navigation, and service-worker cache version 23 are included.
- Compatible lockfile updates resolve the existing development-tool audit findings.

## Verification

ESLint, production build, model boundary checks, and Chrome fixture checks at 1440px and 390px passed. Browser checks cover five redesigned pages, aircraft selection and enlargement, unknown types, missing readings, and feed failures. Production paths retain /Shep-Shack/. Full npm audit reports zero vulnerabilities after compatible updates.

Local test fixtures stay in the design workspace and are excluded from this app. No deployment has been performed. Live home readings and Settings views were inspected in a signed-in household session. Installed-phone acceptance remains a final check before deployment.

## One-screen layout update

Replaced the conflicting landscape overflow lock with a layout sized to the viewport. Home keeps four information tiles visible. Weather shows current conditions, twelve hourly readings, the seven-day forecast, and radar together. Safety keeps official notices, air quality, earthquakes, fire map, incidents, and satellite heat detections together. Keg analytics and Settings use explicit view buttons; long feeds use Previous/Next controls. Sports details open in a dialog. Phone flight radar has Radar, List, and Aircraft views. Legacy landscape rules that hid lower rows are overridden.

Stress rendering checks cover desktop sizes down to 1024×600 and phones down to 320×568. Main views, forecast/radar, long safety feeds, and keg analytics fit without document scrolling or clipped controls. Live APIs and authentication are unchanged.

Weather overview and solid reading surfaces verified at 1440×900, 1280×720, 1024×600, 390×844, 390×667, and 320×568. No weather subview tabs, document scrolling, or clipped controls; hourly detail dialogs remain available. Background artwork is retained in the masthead, with opaque surfaces behind dashboard data.

Safety now uses one opaque reading surface with all six sections visible. Reports retain paging within each section; full notices, incident details, and satellite coordinates/links open from the summary. Empty and failed-feed states remain explicit. Layout and detail interactions checked at desktop and phone sizes down to 320×568; existing API hooks and map markers are unchanged.

## November layout review

Home now uses a compact masthead, nearest-aircraft rows with type, route, distance and altitude, and specific safety readings in place of the large shield and Area watch label. Keg liquid is amber with a pale foam line. Sports leads with live games, then dated results in newest-first order; the latest result has stronger visual emphasis than upcoming fixtures. Undated results remain available after dated results. Padres results look back through the previous year for offseason coverage.

Flights opens to the aircraft list on phones. List, radar and selected-aircraft panels have separate reading surfaces on desktop, range controls filter both list and radar, and only the selected radar aircraft displays its callsign. Safety report panels have clearer boundaries and larger phone text. Phone pages can grow and scroll to preserve readable data; Sports and Flights can also grow on smaller desktop screens.

Visual review used temporary sample data at desktop and 390×844 phone dimensions, including flight selection. The sample entry and data were removed. Household authentication and existing feeds remain connected. Lint, production build, and model checks for sports ordering and safety empty/error states passed. These changes remain local for review.

## Two-tap connection

Added separate Beer and Sparkling Water taps, independent Supabase reading/pour/refill queries, scale-specific notifications, and a Home water summary. The second controller now sends `scaleId: sparkling-water`. Its existing calibration and current 30% level were preserved. Its firmware compiled and was flashed successfully at 115200 baud after a high-speed connection failure. The controller's local `/keg` endpoint confirms its identity and ready/calibrated state.

The database migration and `keg-ingest` / `notification-worker` functions were deployed to bring the second scale online. Beer-only compatibility views preserve the currently published dashboard. All live event/reading separation checks passed, with household policies retained. The redesigned frontend remains local; the tap selector was visually checked using temporary sample data, then the sample entry was removed.

Home now gives both taps equal keg displays in the Kegs card: amber Beer and blue Sparkling Water. Each independently shows percentage, remaining pints or 16 oz pours, and freshness/readiness, and opens its own tap details. Loading and unavailable feeds show an empty gauge. Lint and production build passed.

Refined Home taps into matched inset panels with amber/blue accents, metallic keg shells, larger level readouts, and aligned volume/status details. On phones the Kegs card spans the full row above Sports and Flights, keeping both gauges readable. Desktop and 390×844 phone layouts visually checked with temporary sample data; sample entry removed. Lint and build passed.
