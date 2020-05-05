FILES = manifest.json background.js dashboard.html manual.html style.css dashboard.js zicon.png wind.svg img

release: VRDashboard.zip

VRDashboard.zip: $(FILES)
	zip -r VRDashboard.zip $(FILES)
