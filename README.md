# Synapse SDK Web Tools

This branch contains web-based tools for the Synapse SDK.

## Contents

- `index.html` - Landing page
- `pandora-admin.html` - Pandora Admin Portal for managing storage providers

## Building

```bash
npm install
npm run build
```

This creates bundled JavaScript in `js/` that includes all dependencies (ethers, synapse-sdk, reown).

## Local Development

Open `index.html` or `pandora-admin.html` directly in a browser after building.

## Deployment

The contents of this branch are served via GitHub Pages.

## License

Apache-2.0
