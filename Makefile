FILES = manifest.json background.js dashboard.html style.css dashboard.js zicon.png wind.svg

release: VRDashboard.zip

VRDashboard.zip: $(FILES)
	zip VRDashboard.zip $(FILES)
