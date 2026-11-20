# Scroll-to-bottom is a one-shot action by default

Opening or refreshing the chat page, or selecting a group, lands at the newest messages once with following off. Late-loading media and attitude rows are compensated while that action settles. With following off, new Group Messages arriving through View Refresh or Catch-up are announced for the user to jump to. Reading position is kept within the current page instance.

Manually scrolling to the bottom or clicking either the new-messages pill or the scroll-bottom button turns following on for the current group. While following, new Group Messages and late-loading content keep the viewport at the bottom. Scrolling up or hiding the page turns following off. A visible chat keeps following when another window takes focus. After the page becomes visible again, Catch-up preserves the reading position. Automatic scrolling during list layout preserves the current following state.

An earlier follow mode enabled itself on open and resumed following on re-entry while the user was reading history. A later revision restored the reading position across page loads, where stale anchors could send every refresh paging through days of history. One-shot scrolling remains the default on open, and following requires a deliberate return to the latest messages after leaving the page.
