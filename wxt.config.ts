import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Tab Sweeper',
    description: 'Closes tabs you have not looked at in a while. Keeps pinned tabs and Zen Essentials.',
    permissions: ['tabs', 'storage', 'alarms'],
    // Each browser warns about the other's keys, so emit them per target.
    ...(browser !== 'firefox' && { minimum_chrome_version: '121' }), // first Chrome with tab.lastAccessed
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: '{f0936476-9125-48cc-9c38-0eb2d60d9f77}',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
