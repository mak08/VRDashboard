 var s = document.createElement('script');
 s.src = chrome.extension.getURL('listener.js');
 s.onload = function() {
     this.remove();
 };
 (document.head || document.documentElement).appendChild(s);



