# Retro aircraft artwork

The owner supplied four transparent illustrations. The source files in Downloads were not changed.

Active website assets:

- `cessna_172_skyhawk_retro.png`: copied unchanged from the supplied Cessna PNG, 1600 × 1000.
- `piper_pa28r_arrow_retro_clean.png`: separate cleaned copy of the supplied Piper illustration, 1586 × 992.
- `sikorsky_ch53e_super_stallion_retro_clean.png`: separate cleaned copy of the supplied helicopter illustration, 1586 × 992.

Piper and helicopter cleanup used the built-in imagegen tool with transparent output. The output was inspected for the intended subjects, removal of stray fragments, and genuine transparency. The source artwork's visual style was retained. The tool returned slightly different canvas dimensions; viewport metadata in `aircraft-catalog.mjs` fits each aircraft's visible bounds in CSS. CSS clips only empty transparent margins; the PNGs are not cropped or flattened. No stock photos remain in the active catalog.

## Piper cleanup prompt

Use case: precise-object-edit. Asset type: supplied retro aircraft illustration for a website. Remove only the stray unrelated helicopter undercarriage/wheels fragment floating at the upper left above the Piper airplane's tail (roughly x160–790, y310–402). Preserve the entire main Piper PA-28R airplane below, including the tall vertical tail, both wings, propeller, landing gear, all fine distressed texture and orange cream teal coloring. Do not redesign or change the plane, do not remove any of the airplane tail. Keep original framing and 1600x1000 canvas. Output a genuinely transparent PNG: all empty space and the removed fragment area must have zero alpha. No text, new objects or background.

## Super Stallion cleanup prompt

Use case: precise-object-edit. Asset type: supplied retro aircraft illustration for a website. Remove only the stray disconnected fragments of OTHER airplanes floating around the CH-53E helicopter: the two small wheels/fragments above the main helicopter around x880–1290 y360–400; and the cropped airplane tail, antenna and propeller fragments along the lower edge around x825–1430 y674–710. Preserve the complete main CH-53E helicopter exactly including its long thin main rotor blades, tail rotor, landing gear, silhouette, cream orange teal palette and all distressed print texture. Do not redesign or change the helicopter. Keep original framing and 1600x1000 canvas. Output a genuinely transparent PNG: all empty space and removed fragment areas must have zero alpha. No text, new objects or background.

## Bell helicopter

`bell_helicopter_retro.png`: copied unchanged from the supplied “Retro Teal and Orange Utility Helicopter.png”, 1568 × 1003 with alpha transparency. Used as a Bell family reference for the Bell types already recognized by the dashboard (B06, B06T, B407, B429). The live feed supplies the displayed model name; the caption explicitly notes that the illustration may differ from that model. No variant is inferred from the artwork.
