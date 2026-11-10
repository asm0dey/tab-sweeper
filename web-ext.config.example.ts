// Copy to web-ext.config.ts (git-ignored) and point these at your browsers.
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: {
    chromium: '/usr/bin/chromium',
    brave: '/usr/bin/brave',
    firefox: '/usr/bin/zen-browser',
  },
});
