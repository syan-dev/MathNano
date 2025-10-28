// This is the (service_worker) background.js script

// 1. Open the side panel when the user clicks the action icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 2. Set the side panel to open on click (optional but good)
// This ensures the panel opens on click for all tabs
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});