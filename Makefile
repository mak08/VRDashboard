FILES = manifest.json background.js dashboard.html manual.html style.css dashboard.js nmea.js util.js zicon.png wind.svg img nmea_proxy.py cartoVR

release: VRDashboard.zip

VRDashboard.zip: $(FILES)
	zip -r VRDashboard.zip $(FILES)
