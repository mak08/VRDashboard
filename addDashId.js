window.addEventListener("load", function () {
  const dataHolder = document.createElement("div");
  dataHolder.setAttribute("id", "zezoDashId");
  document.body.appendChild(dataHolder);


  document.getElementById('zezoDashId').setAttribute('ver', chrome.runtime.getManifest().version);
  document.getElementById('zezoDashId').setAttribute('extId',    chrome.runtime.id);
});