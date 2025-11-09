# Extension Icons

Place your extension icons in this directory:

- `icon16.png` - 16x16px (for favicon)
- `icon32.png` - 32x32px (for toolbar)
- `icon48.png` - 48x48px (for extension management)
- `icon128.png` - 128x128px (for Chrome Web Store)

Plasmo will automatically detect icons in the `assets/` folder and include them in the manifest.

## Quick Icon Generation

You can use any of these tools to generate icons:
- https://www.figma.com
- https://www.canva.com
- https://favicon.io/favicon-generator/

Or create a simple placeholder with ImageMagick:
```bash
convert -size 128x128 xc:blue -pointsize 72 -fill white -gravity center -annotate +0+0 "C" icon128.png
```
