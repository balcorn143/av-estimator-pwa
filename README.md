# AV Estimator PWA

A Progressive Web App for Audio/Visual project estimation.

## Quick Start (Local Testing)

1. Open `index.html` in a web browser
2. The app will work locally with sample data

## GitHub Pages Setup

### Step 1: Create a GitHub Account (if needed)
1. Go to https://github.com
2. Click "Sign up"
3. Follow the prompts (free account is fine)

### Step 2: Create a Repository
1. Click the "+" button in the top right → "New repository"
2. Repository name: `av-estimator`
3. Set to **Private** (only you and invited collaborators can see it)
4. Check "Add a README file"
5. Click "Create repository"

### Step 3: Upload Files
1. Click "uploading an existing file" link (or "Add file" → "Upload files")
2. Drag and drop these files:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `av_catalog.json`
   - `av_packages.json`
   - `icon-192.png` (create from generate-icons.html)
   - `icon-512.png` (create from generate-icons.html)
3. Click "Commit changes"

### Step 4: Enable GitHub Pages
1. Go to repository "Settings" tab
2. Click "Pages" in the left sidebar
3. Under "Source", select "Deploy from a branch"
4. Under "Branch", select "main" and "/ (root)"
5. Click "Save"
6. Wait 1-2 minutes, then visit: `https://YOUR_USERNAME.github.io/av-estimator`

### Step 5: Update Config (for auto-sync)
1. Edit `index.html` in GitHub
2. Find the `CONFIG` section near the top
3. Set `GITHUB_BASE_URL` to: `https://raw.githubusercontent.com/YOUR_USERNAME/av-estimator/main/`
4. Commit the change

Now when you update `av_catalog.json` in GitHub, the app will automatically fetch the latest version!

## Creating Icons

1. Open `generate-icons.html` in a browser
2. Right-click each canvas
3. Select "Save image as..."
4. Save as `icon-192.png` and `icon-512.png`

## Installing as Desktop App

Once hosted on GitHub Pages:
1. Visit your app URL in Chrome or Edge
2. Click the install icon in the address bar (or menu → "Install AV Estimator")
3. The app will appear in your Start Menu/Applications

## Updating the Catalog

1. Go to your GitHub repository
2. Click on `av_catalog.json`
3. Click the pencil icon to edit
4. Make your changes (or upload a new file)
5. Commit the changes
6. The app will fetch the updated catalog within a minute

## File Structure

```
av-estimator/
├── index.html          # The main app
├── manifest.json       # PWA configuration
├── sw.js              # Service worker (offline support)
├── av_catalog.json    # Your component catalog
├── av_packages.json   # Saved packages
├── icon-192.png       # App icon (small)
├── icon-512.png       # App icon (large)
└── README.md          # This file
```

