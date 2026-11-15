// Owner-supplied aircraft type illustrations; originals remain unchanged in Downloads.
const aircraftCatalog = {
  P28R: {
    name: 'Piper PA-28R Arrow', category: 'Single-engine propeller', image: `${(import.meta.env?.BASE_URL??'/')}retro/aircraft/piper_pa28r_arrow_retro_clean.png`, artwork: true,
    viewport: { x: 142, y: 307, width: 1351, height: 415, canvasWidth: 1586 },
    photographer: '', license: '', licenseUrl: '', source: '',
  },
  CH53E: {
    name: 'CH-53E Super Stallion', category: 'Heavy-lift helicopter', rotorcraft: true, image: `${(import.meta.env?.BASE_URL??'/')}retro/aircraft/sikorsky_ch53e_super_stallion_retro_clean.png`, artwork: true,
    viewport: { x: 140, y: 281, width: 1316, height: 436, canvasWidth: 1586 },
    photographer: '', license: '', licenseUrl: '', source: '',
  },
  C172: {
    name: 'Cessna 172 Skyhawk', category: 'Single-engine propeller', image: `${(import.meta.env?.BASE_URL??'/')}retro/aircraft/cessna_172_skyhawk_retro.png`, artwork: true,
    viewport: { x: 142, y: 277, width: 1318, height: 447, canvasWidth: 1600 },
    photographer: '', license: '', licenseUrl: '', source: '',
  },
};

// Generic owner-supplied Bell artwork. Keep the tracked model name from the feed.
const bellArtwork = {
  name: 'Bell helicopter', category: 'Helicopter', rotorcraft: true,
  image: `${(import.meta.env?.BASE_URL??'/')}retro/aircraft/bell_helicopter_retro.png`,
  artwork: true, useFeedName: true, maxDisplayWidth: 'min(100%, clamp(110px, calc(100vh - 470px), 300px))',
  viewport: { x: 0, y: 0, width: 1568, height: 1003, canvasWidth: 1568 },
  referenceNote: 'Bell family illustration · model may differ',
}
// Explicit groups take priority over generic feed categories and model-name hints.
const typeGroups = {
  'single-prop': `C120 C140 C150 C152 C162 C165 C170 C172 C175 C177 C180 C182 C185 C188 C190 C195 C206 C207 C208 C210 C72R C72S C77R C82R C82S SR20 SR22 DA20 DA40 BE35 BE36 M20P M20T PC12 TBM7 TBM8 TBM9 TBM1 P210 R172 R182 RV3 RV4 RV6 RV7 RV8 RV9 RV10 RV12 RV14 J2 J3 J4 J5 PA11 PA12 PA14 PA15 PA16 PA17 PA18 PA20 PA22 PA24 PA25 PA28 PA32 PA36 PA38 PA46 P28A P28B P28R P28T P32R P32T P46T P46M`,
  'multi-prop': `C303 C310 C320 C335 C340 C401 C402 C404 C411 C414 C421 C425 C441 BE55 BE58 BE60 BE65 BE76 BE80 BE99 BE9L BE10 BE20 BE30 B350 DA42 DA62 PA23 PA27 PA30 PA31 PA34 PA39 PA42 PA44 PA60 P31T P31N P31P PAY1 PAY2 PAY3 PAY4 DH8A DH8B DH8C DH8D DHC6 AT43 AT45 AT72 AT75 AT76 SF34 SF20 SW4 MU2 P180 AC50 AC68 AC90 AC95 BN2P BN2T`,
  'business-jet': `C25A C25B C25C C500 C501 C510 C525 C550 C551 C55B C560 C56X C650 C680 C68A C700 C750 GLF2 GLF3 GLF4 GLF5 GLF6 GLF7 GLF8 G150 G280 G450 G500 G550 G600 G650 G700 GLEX GL5T GL6T GL7T CL30 CL35 CL60 CL65 F2TH FA10 FA20 FA50 FA7X FA8X F900 LJ23 LJ24 LJ25 LJ28 LJ31 LJ35 LJ40 LJ45 LJ55 LJ60 LJ70 LJ75 H25A H25B H25C HA4T HDJT EA50 E50P E55P E545 E550 PC24 PRM1 SJ30 SF50 PA47`,
  fighter: `F14 F15 F16 F18 F22 F35 A10 AV8B EUFI RFAL MIR2 T38 F5 L39 HUNT HAWK`,
  'military-prop': `C130 C30J C160 C27J C295 CN35 A400 P3 E2`,
  'military-jet': `C17 C5 C5M C135 K35R K35E KC10 KC46 P8 E3TF E6 B1 B2 B52`,
  tiltrotor: `V22 V280 A609`,
  helicopter: `B06 B06T B105 B205 B206 B212 B214 B222 B230 B407 B412 B427 B429 B430 B505 B525 R22 R44 R66 EC20 EC25 EC30 EC35 EC45 EC55 EC75 H120 H125 H130 H135 H145 H155 H160 H175 H225 AS50 AS55 AS65 AS32 AS3B A109 A119 A139 A149 A169 A189 S61 S64 S70 S76 S92 UH1 UH60 H60 H64 AH64 AH1Z AH1 HUCO NH90 MI8 MI17 KA32 MD52 MD60 MD90 H500 H369 S269 EN28`,
  'heavy-helicopter': `H47 CH47 H53 CH53 CH53E CH53K H54 CH54 MI26`,
}
const groupByType = new Map(Object.entries(typeGroups).flatMap(([group, codes]) => codes.split(/\s+/).map(code => [code, group])))
const piperSingles = new Set(typeGroups['single-prop'].split(/\s+/).filter(code => /^(PA|P28|P32|P46|J[2-5]$)/.test(code)))
const labels = {
  'single-prop': 'Single-engine propeller aircraft', 'multi-prop': 'Multi-engine propeller aircraft',
  airliner: 'Commercial jet', 'business-jet': 'Business jet', jet: 'Jet aircraft', fighter: 'Military fighter',
  'military-prop': 'Military propeller transport', 'military-jet': 'Military transport jet',
  tiltrotor: 'Tiltrotor', helicopter: 'Helicopter', 'heavy-helicopter': 'Heavy helicopter', unknown: 'Aircraft',
}

export function aircraftCategory(code, modelName = '', metadata = {}) {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : ''
  if (groupByType.has(normalized)) return groupByType.get(normalized)
  if (/^(A3[0-9][0-9A-Z]|A19[BN]|A20[BN]|A21[BN]|BCS[13]|B7[0-9A-Z]{2}|B38[0-9M]|B39M|E1[3479][05]|E75[LS]|E29[05]|CRJ[1279X]|MD(11|8[0-9]|90)|DC(8|9|10))$/.test(normalized)) return 'airliner'
  const name = [modelName, metadata?.desc].filter(value => typeof value === 'string').join(' ')
  // Identified special configurations must not fall through to small-prop art.
  if (/\b(osprey|tilt.?rotor|v-?22)\b/i.test(name)) return 'tiltrotor'
  if (/\b(chinook|super stallion|king stallion|ch-?(47|53|54)|mi-?26)\b/i.test(name)) return 'heavy-helicopter'
  if (/\b(helicopter|rotorcraft|black ?hawk|robinson|huey|apache|eurocopter)\b|\b(bell|sikorsky|agusta(?:westland)?|airbus)\s+(?:aw-?|h-?|s-?|r-?)?(?:109|119|139|169|189|206|212|407|412|429|505|60|70|76|92|120|125|130|135|145|155|160|175|225)\b/i.test(name)) return 'helicopter'
  if (/\b(gulfstream|citation|learjet|challenger|falcon|hawker|phenom|praetor|hondajet|vision jet|piperjet|business jet|private jet|global express)\b/i.test(name)) return 'business-jet'
  if (/\bf\/?a?-?(14|15|16|18|22|35)\b|\b(fighter|super hornet|eurofighter|rafale|harrier)\b/i.test(name)) return 'fighter'
  if (/\b(c-?130|hercules|atlas a400|c-?27j)\b/i.test(name)) return 'military-prop'
  if (/\b(c-?17|c-?5m?|globemaster|galaxy|stratotanker|poseidon)\b/i.test(name)) return 'military-jet'
  if (/\b(boeing\s+7[0-9]{2}|airbus\s+a-?(?:3[0-9]{2}|2[12]0)|embraer\s+e-?1[0-9]{2}|crj-?[0-9]+|airliner)\b/i.test(name)) return 'airliner'
  // ICAO descriptions such as L1P or H2T are engine/configuration data.
  // ADS-B weight classes (A1/light, A3/large) alone cannot identify jet vs prop.
  const description = [metadata?.typeDescription, metadata?.icaoDescription, metadata?.desc].find(value => typeof value === 'string' && /^[LASH][1-8][PTJE](?:\/\w+)?$/i.test(value.trim()))?.trim().toUpperCase()
  if (description?.startsWith('H') || metadata?.category === 8 || metadata?.category === 'A7') return 'helicopter'
  if (description && description[2] === 'J') return 'jet'
  if (description && /[PT]/.test(description[2])) return description[1] === '1' ? 'single-prop' : 'multi-prop'
  if (/\b(baron|king air|twin otter|twin commander|seneca|seminole|navajo|cheyenne|dash.?8|atr.?[47]2|twin[- ]engine prop)\b/i.test(name)) return 'multi-prop'
  if (/\b(skyhawk|skylane|stationair|caravan|bonanza|mooney|cherokee|archer|arrow|warrior|saratoga|cub|single[- ]engine (?:prop|piston|turboprop))\b|\b(cirrus\s+sr-?(20|22)|diamond\s+da-?(20|40)|cessna\s+(?:1[0-9]{2}|20[678]|210)|pilatus\s+pc-?12|(?:daher|socata)\s+tbm)\b/i.test(name)) return 'single-prop'
  return 'unknown'
}

// Add the new illustrations here when supplied. Null slots never request
// nonexistent images or substitute a propeller aircraft for an identified jet.
const categoryArtwork = {
  'single-prop': aircraftCatalog.C172,
  helicopter: bellArtwork,
  'heavy-helicopter': aircraftCatalog.CH53E,
  'multi-prop': null, airliner: null, 'business-jet': null, jet: null,
  fighter: null, 'military-prop': null, 'military-jet': null, tiltrotor: null,
}
export const aircraftCategoryLabel = category => labels[category] || labels.unknown

export function aircraftArt(code, modelName = '', metadata = {}) {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : ''
  const category = aircraftCategory(normalized, modelName, metadata)
  const exact = Object.hasOwn(aircraftCatalog, normalized) ? aircraftCatalog[normalized] : null
  const family = piperSingles.has(normalized) || category === 'single-prop' && /^piper\b/i.test(typeof modelName === 'string' ? modelName.trim() : '') ? aircraftCatalog.P28R : null
  const art = exact || family || categoryArtwork[category]
  if (!art) return null
  return { ...art, category: aircraftCategoryLabel(category), useFeedName: true,
    referenceNote: exact ? 'Illustrated type reference' : `${aircraftCategoryLabel(category)} illustration · model may differ` }
}
