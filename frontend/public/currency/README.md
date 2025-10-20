# Currency Icons

Place your Path of Exile currency icons in this directory.

## Naming Convention

Name your files exactly as the currency appears in the PoE API (lowercase, with underscores):

### Common Currencies
- `chaos.png` - Chaos Orb
- `divine.png` - Divine Orb
- `exalted.png` - Exalted Orb
- `mirror.png` - Mirror of Kalandra
- `mirror_shard.png` - Mirror Shard

### Other Currencies
- `blessed.png` - Blessed Orb
- `vaal.png` - Vaal Orb
- `ancient.png` - Ancient Orb
- `harbinger.png` - Harbinger's Orb
- `annul.png` - Orb of Annulment
- `regal.png` - Regal Orb
- `alchemy.png` - Orb of Alchemy
- `fusing.png` - Orb of Fusing
- `chromatic.png` - Chromatic Orb
- `jeweller.png` - Jeweller's Orb
- `alteration.png` - Orb of Alteration
- `scouring.png` - Orb of Scouring
- `regret.png` - Orb of Regret
- `gemcutter.png` - Gemcutter's Prism

## Image Specifications

- **Format**: PNG or WebP (PNG recommended for transparency)
- **Size**: 32x32px to 64x64px
- **Background**: Transparent
- **File size**: Keep under 50KB per image

## Where to Get Images

1. **PoE Wiki**: https://www.poewiki.net/wiki/Currency
   - Right-click on currency icons and save
   
2. **PoE Database**: https://poedb.tw/us/Currency
   - High-quality currency images
   
3. **Official Assets**: From the game files
   - `Path of Exile/Data` directory

4. **Community Resources**:
   - poe.ninja
   - pathofexile.com/trade

## Example Structure

```
currency/
├── README.md (this file)
├── chaos.png
├── divine.png
├── exalted.png
├── mirror.png
├── mirror_shard.png
└── ... (add more as needed)
```

## Fallback Behavior

If an image is not found, the component will automatically display the currency name as text instead.
