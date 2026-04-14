chrome.action.onClicked.addListener(async () => {
    const url = chrome.runtime.getURL('popup.html');
    // 优先在当前窗口查找，再找其他窗口
    let tabs = await chrome.tabs.query({ url, currentWindow: true });
    if (tabs.length === 0) {
        tabs = await chrome.tabs.query({ url });
    }
    if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true });
    } else {
        await chrome.tabs.create({ url });
    }
});


