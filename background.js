// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var version = "1.0";
var debuggeeTab;
var dashboardTab;

function onPageClicked (tab) {
    debuggeeTab = tab;
    chrome.debugger.attach({tabId:tab.id}, version, onAttach.bind(null, tab.id));
}

function checkForValidUrl (tabId, changeInfo, tabInfo) {

    try {
        if (tabInfo && tabInfo.url.indexOf('virtualregatta.com') >= 0) {
            chrome.pageAction.show(tabId);
        }
    } catch (e) {
        console.log("Tab is gone: " + tabId);
    }
};

function onTabRemoved (tabId, removeInfo) {
    if ( debuggeeTab && (tabId == debuggeeTab.id) ) {
        try {
            chrome.tabs.remove(dashboardTab.id);
        } catch (e) {
            console.log(JSON.stringify(e));
        }
    } else if (dashboardTab && (tabId == dashboardTab.id) ) {
        try {
            chrome.debugger.detach({
                tabId: debuggeeTab.id
            });
        } catch (e) {
            console.log(JSON.stringify(e));
        }
    }
}

function onAttach (tabId) {
    if (chrome.runtime.lastError) {
        alert(chrome.runtime.lastError.message);
    } else {
        chrome.tabs.create({url: "dashboard.html?" + tabId, active: false},
                           function (tab) {
                               dashboardTab = tab;
                           });
    }
}

chrome.pageAction.onClicked.addListener( onPageClicked );
chrome.tabs.onUpdated.addListener( checkForValidUrl );
chrome.tabs.onRemoved.addListener( onTabRemoved );

// mostly useful for development - enable page action after 
// ext reload
chrome.tabs.onActivated.addListener( function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        checkForValidUrl(activeInfo.tabId,null,tab);
    });
});


