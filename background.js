// ─────────────────────────────────────────────────────────────────────────────
// background.js  –  Tab Counter Service Worker  (per-window counts)
//
// STRATEGY
// ─────────
// chrome.action.setBadgeText() accepts an optional `tabId` parameter.
// When a tabId is supplied, Chrome uses that text only while that specific tab
// is the active/foreground tab — effectively giving each window its own badge.
//
// So the approach is:
//   1. Query ALL tabs, grouped by windowId.
//   2. For every windowId, count how many tabs it has.
//   3. For every individual tab in that window, set the badge to that window's
//      count via setBadgeText({ text, tabId }).
//
// This means Window A (8 tabs) shows "8" and Window B (1 tab) shows "1",
// simultaneously, because each tab carries its own badge override.
// ─────────────────────────────────────────────────────────────────────────────

// ── Badge styling constants ───────────────────────────────────────────────────
const BADGE_BG_COLOR   = "#E53E3E"; // Vibrant red
const BADGE_TEXT_COLOR = "#FFFFFF"; // White text

// ─────────────────────────────────────────────────────────────────────────────
// Core helper: rebuild ALL per-tab badge overrides from scratch
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Queries every open tab, groups them by windowId, and sets a per-tab badge
 * override on every tab so that each window shows its own local tab count.
 *
 * Why rebuild all windows on every event?
 * When a tab moves from Window A → Window B, BOTH windows' counts change.
 * Rebuilding all at once is simpler and always stays correct.
 */
async function updateAllWindowBadges() {
  // ── 1. Fetch every tab across every window ──────────────────────────────
  const allTabs = await chrome.tabs.query({});

  // ── 2. Group tabs by windowId ───────────────────────────────────────────
  // Result: Map<windowId, Tab[]>
  const windowMap = new Map();
  for (const tab of allTabs) {
    if (!windowMap.has(tab.windowId)) {
      windowMap.set(tab.windowId, []);
    }
    windowMap.get(tab.windowId).push(tab);
  }

  // ── 3. For each window, set a badge on every one of its tabs ───────────
  for (const [, tabs] of windowMap) {
    const count     = tabs.length;
    const badgeText = count.toString();

    for (const tab of tabs) {
      // Per-tab override: this badge value is shown when `tab.id` is active.
      // Different windows have different active tabs → different counts show up.
      await chrome.action.setBadgeText({
        text:  badgeText,
        tabId: tab.id,
      });

      await chrome.action.setBadgeBackgroundColor({
        color: BADGE_BG_COLOR,
        tabId: tab.id,
      });

      // Badge text colour (Chrome 111+). Silently ignored on older builds.
      try {
        await chrome.action.setBadgeTextColor({
          color: BADGE_TEXT_COLOR,
          tabId: tab.id,
        });
      } catch (_) {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tab opened in any window.
 * The new tab's ID is available in the callback, but we rebuild everything
 * so Window A and Window B both update if needed.
 */
chrome.tabs.onCreated.addListener(() => {
  updateAllWindowBadges();
});

/**
 * Tab closed in any window.
 * Note: the tab is already gone when this fires, so chrome.tabs.query()
 * will naturally exclude it — no special handling needed.
 */
chrome.tabs.onRemoved.addListener(() => {
  updateAllWindowBadges();
});

/**
 * Tab detached from a window (first step of dragging a tab to a new window).
 * The tab temporarily has no window at this point; we rebuild so the source
 * window's count drops immediately.
 */
chrome.tabs.onDetached.addListener(() => {
  updateAllWindowBadges();
});

/**
 * Tab attached to a window (second step of dragging — lands in target window).
 * The target window's count goes up; both windows need their badges refreshed.
 */
chrome.tabs.onAttached.addListener(() => {
  updateAllWindowBadges();
});

/**
 * Tab moved within the same window (reordering).
 * Count doesn't change, but we refresh for safety and future-proofing.
 */
chrome.tabs.onMoved.addListener(() => {
  updateAllWindowBadges();
});

/**
 * Tab replaced due to prerendering / instant-pages.
 * The old tabId is gone; the new tabId needs its badge set.
 */
chrome.tabs.onReplaced.addListener(() => {
  updateAllWindowBadges();
});

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation  –  handles service worker wake-ups
// ─────────────────────────────────────────────────────────────────────────────

/** First install or extension update. */
chrome.runtime.onInstalled.addListener(() => {
  updateAllWindowBadges();
});

/** Browser restarted. */
chrome.runtime.onStartup.addListener(() => {
  updateAllWindowBadges();
});
