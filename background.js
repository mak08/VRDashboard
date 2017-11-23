// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var version = "1.0";

var dashboardTabId;

chrome.pageAction.onClicked.addListener(function(tab) {
    chrome.debugger.attach({tabId:tab.id}, version, onAttach.bind(null, tab.id));
    chrome.debugger.onDetach.addListener( function (debuggee, reason) {
        chrome.tabs.remove(dashboardTabId);
    });
});

function checkForValidUrl(tabId, changeInfo, tabInfo) {

    if (tabInfo.url.indexOf('virtualregatta.com') >= 0) {
        chrome.pageAction.show(tabId);
    }
};

chrome.tabs.onUpdated.addListener(checkForValidUrl);

// mostly useful for development - enable page action after 
// ext reload

chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        checkForValidUrl(activeInfo.tabId,null,tab);
    });
});


function onAttach(tabId) {
    if (chrome.runtime.lastError) {
        alert(chrome.runtime.lastError.message);
        return;
    }

    chrome.tabs.create(
        {url: "dashboard.html?" + tabId},
        function (tab) {
            dashboardTabId = tab.id;
        });
}
