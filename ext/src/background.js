chrome.action.onClicked.addListener(async () => {
    const url = chrome.runtime.getURL('popup.html');
    const [tab] = await chrome.tabs.query({ url });
    if (tab && tab.id) {
        await chrome.tabs.update(tab.id, { active: true });
    } else {
        await chrome.tabs.create({ url });
    }
});


