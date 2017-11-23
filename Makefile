FILES = manifest.json background.js dashboard.html dashboard.js zicon.png

release: VRDashboard.zip

VRDashboard.zip: $(FILES)
	zip VRDashboard.zip $(FILES)
