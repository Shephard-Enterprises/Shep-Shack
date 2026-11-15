import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { aircraftArt, aircraftCategory } from './retro-aircraft.mjs'

test('single props across manufacturers share the Cessna while Piper singles retain their art', () => {
  for (const code of ['SR22', 'DA40', 'BE36', 'M20P', 'PC12', 'TBM9', 'C210', 'RV7']) {
    const art = aircraftArt(code)
    assert.match(art.image, /cessna_172/)
    assert.equal(art.useFeedName, true)
    assert.match(art.referenceNote, /model may differ/)
  }
  assert.match(aircraftArt('PA28').image, /piper/)
  assert.match(aircraftArt('P28R').image, /piper/)
})

test('helicopter families and provider rotorcraft categories use available helicopter artwork', () => {
  for (const code of ['R44', 'EC35', 'AS50', 'S76', 'UH60', 'B407']) {
    assert.match(aircraftArt(code).image, /bell_helicopter/)
    assert.equal(aircraftArt(code).rotorcraft, true)
  }
  for (const code of ['H53', 'CH53E', 'CH47']) assert.match(aircraftArt(code).image, /ch53e/)
  for (const category of ['A7', 8]) assert.match(aircraftArt('', '', { category }).image, /bell_helicopter/)
})

test('identified jets, transports and tiltrotors never get a small-prop image', () => {
  for (const [code, category] of [
    ['C25B', 'business-jet'], ['C750', 'business-jet'], ['GLF6', 'business-jet'], ['PA47', 'business-jet'],
    ['B738', 'airliner'], ['A320', 'airliner'], ['A20N', 'airliner'], ['E75L', 'airliner'],
    ['F18', 'fighter'], ['C130', 'military-prop'], ['C135', 'military-jet'], ['C17', 'military-jet'],
    ['V22', 'tiltrotor'], ['BE20', 'multi-prop'], ['PA34', 'multi-prop'],
  ]) {
    assert.equal(aircraftCategory(code), category, code)
    assert.equal(aircraftArt(code), null, code)
  }
})

test('description and name fallbacks distinguish configurations without matching all Cessnas or Pipers as props', () => {
  for (const [name, category] of [
    ['Cirrus SR22', 'single-prop'], ['Piper Cherokee', 'single-prop'], ['Piper Seneca', 'multi-prop'],
    ['Cessna Citation CJ3', 'business-jet'], ['PiperJet', 'business-jet'],
    ['Airbus A320', 'airliner'], ['Robinson R44', 'helicopter'], ['Sikorsky UH-60 Black Hawk', 'helicopter'],
    ['CH-47 Chinook', 'heavy-helicopter'], ['V-22 Osprey', 'tiltrotor'],
  ]) assert.equal(aircraftCategory('', name), category, name)
  assert.match(aircraftArt('', '', { desc: 'CIRRUS SR22' }).image, /cessna/)
  assert.equal(aircraftCategory('', '', { typeDescription: 'L2J' }), 'jet')
  assert.equal(aircraftCategory('', '', { icaoDescription: 'L1P/S' }), 'single-prop')
  assert.equal(aircraftCategory('', '', { desc: 'H2T' }), 'helicopter')
})

test('type codes win over conflicting labels and generic emitter weight classes do not guess propulsion', () => {
  assert.equal(aircraftCategory('C130', 'Cessna 172', { category: 'A1' }), 'military-prop')
  assert.equal(aircraftCategory('C25B', 'Piper Cherokee'), 'business-jet')
  for (const category of ['A1', 'A3', 2, 4]) assert.equal(aircraftArt('', '', { category }), null)
  for (const code of [null, undefined, '', 'UNKNOWN', '__proto__']) assert.equal(aircraftArt(code, null), null)
  assert.match(aircraftArt(' sr22 ').image, /cessna/)
})

test('all current fallback artwork refers to real supplied assets', () => {
  for (const code of ['C172', 'P28R', 'SR22', 'R44', 'CH47', 'CH53E']) {
    const art = aircraftArt(code)
    assert.ok(existsSync(`public${art.image}`), art.image)
    assert.ok(art.viewport.width > 0 && art.viewport.height > 0)
  }
})
