import type { Message } from '@/lib/messages';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '@/lib/settings';
import { getLastSweep, getSettings, getTrash, type LastSweep } from '@/lib/store';
import { filterTrash, groupByDay, type TrashEntry } from '@/lib/trash';

const isDev = import.meta.env.MODE === 'development';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings = DEFAULT_SETTINGS;
let trash: TrashEntry[] = [];
let lastSweep: LastSweep | undefined;

const send = (msg: Message) => browser.runtime.sendMessage(msg);
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const GLOBE =
  '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2">' +
  '<circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2 2 2.8 4 2.8 6.5S10 12.5 8 14.5M8 1.5C6 3.5 5.2 5.5 5.2 8S6 12.5 8 14.5"/></svg>';

function icon(entry: TrashEntry): Node {
  const globe = () => {
    const span = document.createElement('span');
    span.innerHTML = GLOBE; // static markup, no user data
    return span.firstChild!;
  };
  if (!entry.favIconUrl) return globe();
  const img = document.createElement('img');
  img.alt = '';
  img.src = entry.favIconUrl;
  img.addEventListener('error', () => img.replaceWith(globe()), { once: true });
  return img;
}

// ---- Swept panel ----

function renderList() {
  const list = $('list');
  const query = $<HTMLInputElement>('q').value;
  const shown = filterTrash(trash, query);
  $('tab-swept').textContent = `Swept · ${trash.length}`;
  $<HTMLButtonElement>('restore-all').disabled = trash.length === 0;
  $<HTMLButtonElement>('clear').disabled = trash.length === 0;
  list.replaceChildren();
  if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = trash.length === 0 ? 'Nothing swept yet.' : 'No closed tabs match.';
    list.append(empty);
    return;
  }
  for (const group of groupByDay(shown, Date.now())) {
    const sec = document.createElement('div');
    sec.className = 'sec';
    sec.textContent = group.label;
    list.append(sec);
    for (const entry of group.entries) {
      const row = document.createElement('button');
      row.className = 'item';
      row.title = `${entry.title}\n${entry.url}`;
      row.setAttribute('aria-label', `Reopen ${entry.title}`);
      const title = document.createElement('span');
      title.className = 't';
      title.textContent = entry.title;
      const ago = document.createElement('span');
      ago.className = 'ago';
      ago.textContent = hhmm(entry.closedAt);
      row.append(icon(entry), title, ago);
      row.addEventListener('click', () => send({ type: 'restore', ids: [entry.id] }));
      list.append(row);
    }
  }
}

function showConfirm(on: boolean) {
  $('ft-actions').hidden = on;
  $('ft-confirm').hidden = !on;
  if (on) {
    $('confirm-text').textContent = `Clear ${trash.length} tab${trash.length === 1 ? '' : 's'}?`;
    $('confirm-no').focus();
  } else $('clear').focus();
}

// ---- Settings panel ----

function renderSettings() {
  $('enabled').setAttribute('aria-checked', String(settings.enabled));
  const hours = $<HTMLInputElement>('hours');
  const size = $<HTMLInputElement>('trash-size');
  if (document.activeElement !== hours) hours.value = String(settings.idleHours);
  if (document.activeElement !== size) size.value = String(settings.trashSize);
  $('hours-unit').textContent = isDev && settings.devMinutes ? 'min' : 'h';
  $<HTMLInputElement>('dev-minutes').checked = settings.devMinutes;
  $('last-sweep').textContent = lastSweep
    ? `Last sweep ${hhmm(lastSweep.at)} · closed ${lastSweep.closed}`
    : 'No sweep yet';
}

const saveSettings = (patch: Partial<Settings>) => {
  settings = normalizeSettings({ ...settings, ...patch }); // optimistic; storage.onChanged confirms
  renderSettings();
  return send({ type: 'setSettings', patch });
};

function bindNumber(id: string, key: 'idleHours' | 'trashSize') {
  const input = $<HTMLInputElement>(id);
  const commit = () => saveSettings({ [key]: Number(input.value) }).then(() => (input.value = String(settings[key])));
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
}

// ---- Tabs (ARIA tab pattern) ----

function selectTab(which: 'swept' | 'settings') {
  for (const name of ['swept', 'settings'] as const) {
    const on = name === which;
    const tab = $(`tab-${name}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${name}`).hidden = !on;
  }
}

// ---- Wiring ----

async function load() {
  [settings, trash, lastSweep] = await Promise.all([getSettings(), getTrash(), getLastSweep()]);
  renderList();
  renderSettings();
}

$('tab-swept').addEventListener('click', () => selectTab('swept'));
$('tab-settings').addEventListener('click', () => selectTab('settings'));
document.querySelector('.tabs')!.addEventListener('keydown', (e) => {
  const key = (e as KeyboardEvent).key;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
  const next = $('tab-swept').getAttribute('aria-selected') === 'true' ? 'settings' : 'swept';
  selectTab(next);
  $(`tab-${next}`).focus();
});

$('q').addEventListener('input', renderList);
$('restore-all').addEventListener('click', () => send({ type: 'restore', ids: trash.map((e) => e.id) }));
$('clear').addEventListener('click', () => showConfirm(true));
$('confirm-no').addEventListener('click', () => showConfirm(false));
$('confirm-yes').addEventListener('click', async () => {
  await send({ type: 'clear' });
  showConfirm(false);
});

$('enabled').addEventListener('click', () => saveSettings({ enabled: !settings.enabled }));
$('hours-dec').addEventListener('click', () => saveSettings({ idleHours: settings.idleHours - 1 }));
$('hours-inc').addEventListener('click', () => saveSettings({ idleHours: settings.idleHours + 1 }));
bindNumber('hours', 'idleHours');
bindNumber('trash-size', 'trashSize');
$('dev-row').hidden = !isDev;
$('dev-minutes').addEventListener('change', (e) =>
  saveSettings({ devMinutes: (e.target as HTMLInputElement).checked }),
);

browser.storage.onChanged.addListener((_changes, area) => area === 'local' && load());
load();
