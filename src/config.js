import { createClient } from '@supabase/supabase-js'

export const APP_VERSION = '1.1';

export const CONFIG = {
    // GitHub raw content URL - update 'USERNAME' and 'REPO' with your values
    GITHUB_BASE_URL: '',

    // File names
    CATALOG_FILE: 'av_catalog.json',
    PACKAGES_FILE: 'av_packages.json',

    // Supabase
    SUPABASE_URL: 'https://zyxzkwziyysugomjyidb.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_gnK6VeaiKdehrhoUi-b4Fg_LvsEfjCB',
};

// Initialize Supabase client
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// Helper to get data URL (local or GitHub)
export const getDataUrl = (filename) => {
    if (CONFIG.GITHUB_BASE_URL) {
        return CONFIG.GITHUB_BASE_URL + filename + '?t=' + Date.now();
    }
    return './' + filename;
};
