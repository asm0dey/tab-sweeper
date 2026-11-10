// Temporary diagnostic for the Task 1 checkpoint; replaced in Task 5.
export default defineBackground(() => {
  const dump = async (when: string) =>
    console.log(
      when,
      (await browser.tabs.query({})).map((t) => ({
        title: t.title,
        pinned: t.pinned,
        hidden: (t as { hidden?: boolean }).hidden, // Firefox-only field
        lastAccessed: t.lastAccessed,
      })),
    );
  browser.runtime.onInstalled.addListener(() => dump('installed'));
  browser.runtime.onStartup.addListener(() => dump('startup'));
});
