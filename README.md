# Tab Sweeper

A browser extension that closes tabs you haven't looked at in N hours, so the tab bar stays clean on its own.
Works in Zen, Firefox, Chrome, Chromium and Brave.

- **Never closed:** pinned tabs (in Zen this includes Essentials and workspace-pinned tabs), the tab you're
  looking at in each window, tabs playing sound, and private windows.
- **Trash bin:** the last 200 auto-closed tabs (configurable, 10–1000), searchable, one click to reopen.
- **Settings:** an on/off switch and the idle time (1–720 hours, default 12). Checks run every 5 minutes and
  once right after the browser starts.

In Zen, extensions only see the workspace you're in, so tabs in other workspaces are swept shortly after you
switch to that workspace.

## Install

Grab the latest [release](../../releases/latest):

- **Zen / Firefox:** open the `.xpi` and confirm the install.
- **Chrome / Chromium / Brave:** unzip the `-chrome.zip`, open `chrome://extensions`, turn on Developer mode,
  click **Load unpacked** and pick the unzipped folder.

## Develop

Needs [mise](https://mise.jdx.dev) (pins bun).

```sh
bun install
bun run dev          # Chrome with the extension loaded; dev:chromium, dev:brave, dev:zen for the others
bun test             # unit tests
bun run check        # type check
```

Copy `web-ext.config.example.ts` to `web-ext.config.ts` and point it at your browser binaries. Dev builds add a
"count idle time in minutes" switch to Settings so a sweep can be watched quickly.

## Releases

Every push to `main` publishes the next `vN` release. The Firefox build is signed by Mozilla as an unlisted
add-on when the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repository secrets are set.

## Licence

[0BSD](LICENSE)
