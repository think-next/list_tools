chrome.action.onClicked.addListener(async () => {
    const url = chrome.runtime.getURL('popup.html');
    // 优先在当前窗口查找，再找其他窗口
    const [tab] = await chrome.tabs.query({ url, currentWindow: true })
        || await chrome.tabs.query({ url });
    if (tab && tab.id) {
        await chrome.tabs.update(tab.id, { active: true });
    } else {
        await chrome.tabs.create({ url });
    }
});


