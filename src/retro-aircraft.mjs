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
const bellTypes = new Set(['B06', 'B06T', 'B407', 'B429'])

// Share the supplied Skyhawk artwork across Cessna's 100 series, while
// retaining the tracked model name. Explicit types avoid military C130/C135.
const cessna100Types = new Set([
  'C120', 'C140', 'C150', 'C152', 'C162', 'C165', 'C170', 'C175',
  'C177', 'C180', 'C182', 'C185', 'C188', 'C190', 'C195',
  'C72R', 'C72S', 'C77R', 'C82R', 'C82S',
])
const cessna100Artwork = {
  ...aircraftCatalog.C172,
  name: 'Cessna 100 series', useFeedName: true,
  referenceNote: 'Cessna family illustration · model may differ',
}

const piperTypes = new Set([
  'J2', 'J3', 'J4', 'J5',
  'PA11', 'PA12', 'PA14', 'PA15', 'PA16', 'PA17', 'PA18', 'PA20',
  'PA22', 'PA23', 'PA24', 'PA25', 'PA27', 'PA28', 'PA30', 'PA31',
  'PA32', 'PA34', 'PA36', 'PA38', 'PA39', 'PA42', 'PA44', 'PA46', 'PA60',
  'P28A', 'P28B', 'P28R', 'P28T', 'P32R', 'P32T', 'P46T', 'P46M',
  'P31T', 'P31N', 'P31P', 'PAY1', 'PAY2', 'PAY3', 'PAY4',
])
const piperArtwork = {
  ...aircraftCatalog.P28R,
  name: 'Piper aircraft', useFeedName: true,
  referenceNote: 'Piper family illustration · model may differ',
}

export function aircraftArt(code, modelName = '') {
  const normalized=typeof code==='string'?code.trim().toUpperCase():''
  if (Object.prototype.hasOwnProperty.call(aircraftCatalog,normalized)) return aircraftCatalog[normalized]
  if (piperTypes.has(normalized) || /^piper\b/i.test(modelName.trim())) return piperArtwork
  if (cessna100Types.has(normalized)) return cessna100Artwork
  if (bellTypes.has(normalized)) return bellArtwork
  if (normalized==='H53') return { ...aircraftCatalog.CH53E, name:'Sikorsky H-53 family', referenceNote:'CH-53E illustration · subtype not confirmed by feed' }
  return null
}
