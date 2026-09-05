# DRAFT Brand Kit

**DRAFT** — A cross-platform visual workspace for humans and AI agents.
*"If you can't explain it to AI, show it to AI."*

by P4inz | Atharva Patil

---

## Quick Reference

| Use case | File |
|---|---|
| **App icon (Windows)** | `icons/draft.ico` or `desktop/windows/draft-icon.ico` |
| **App icon (macOS)** | `desktop/macos/draft-icon-512.png` |
| **App icon (Linux)** | `desktop/linux/draft-icon-256.png` |
| **Favicon** | `favicon/favicon.svg` (preferred) or `favicon/favicon.ico` |
| **Apple touch icon** | `favicon/apple-touch-icon.png` (180×180) |
| **PWA icons** | `favicon/icon-192x192.png` and `favicon/icon-512x512.png` |
| **GitHub avatar** | `social/github-avatar.png` (500×500) |
| **GitHub social preview** | `social/github-social-preview.png` (1280×640) |
| **Open Graph / link preview** | `social/og-image.png` (1200×630) |
| **Twitter/X card** | `social/twitter-card.png` (1200×600) |
| **Primary logo (SVG)** | `logo/primary/draft-logo-horizontal.svg` |
| **Logo on dark bg** | `logo/primary/draft-logo-horizontal-light.svg` or `logo/variants/draft-on-dark-bg.png` |
| **Logo on light bg** | `logo/primary/draft-logo-horizontal.svg` or `logo/variants/draft-on-light-bg.png` |
| **Symbol only** | `logo/symbol/draft-symbol.svg` |
| **Monochrome (print/docs)** | `logo/monochrome/draft-mono-black.svg` or `draft-mono-white.svg` |
| **Splash screen** | `splash/splash-dark.png` or `splash/splash-light.png` (1920×1080) |

---

## Colors

| Name | Hex | Usage |
|---|---|---|
| Body | `#1A1B2E` | Mark body, dark text |
| Accent | `#0EA5E9` | Fold, tagline, links |
| Background dark | `#0D0D14` | Dark UI backgrounds |
| Background light | `#F8F8FA` | Light UI backgrounds |

## Typography

- **Wordmark / Headers:** JetBrains Mono (Bold/700)
- **Tagline / UI:** JetBrains Mono (Medium/500)
- **Fallbacks:** SF Mono, Menlo, monospace

## Favicon HTML

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="16x16 24x24 32x32 48x48 64x64 128x128 256x256">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

---

## File Structure

```
DRAFT-Brand-Kit/
├── logo/
│   ├── primary/          # Symbol + wordmark horizontal (SVG)
│   ├── symbol/           # Mark only (SVG, all variants)
│   ├── wordmark/         # Text only (SVG)
│   ├── monochrome/       # Single-color versions
│   └── variants/         # On-light, on-dark, transparent (PNG)
├── icons/
│   ├── draft.ico         # Multi-resolution Windows icon
│   ├── svg/              # Icon SVGs (all variants)
│   └── png/              # Icon PNGs: 16–2048px
├── favicon/              # Web favicon set
├── social/               # GitHub, OG, Twitter assets
├── desktop/              # Platform-specific icons
│   ├── windows/
│   ├── macos/
│   └── linux/
├── splash/               # App loading screens (1920×1080)
└── README.md
```

## ICO Contents

`draft.ico` contains embedded PNG data at: 16, 24, 32, 48, 64, 128, 256 px.

## Notes

- All PNGs have transparent backgrounds unless named with `-bg`
- SVG wordmark files reference JetBrains Mono — convert text to outlines for full portability
- The symbol mark is a document shape with a folded corner — the fold is the accent color
