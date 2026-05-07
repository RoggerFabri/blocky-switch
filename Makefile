VERSION := $(shell powershell -NoProfile -Command "(Get-Content manifest.json | ConvertFrom-Json).version")
ZIP     := blocky-switch-$(VERSION).zip

.PHONY: zip clean

zip: clean
	powershell -NoProfile -Command "Compress-Archive -Path manifest.json, background.js, popup.html, popup.js, images -DestinationPath $(ZIP)"
	@echo Built $(ZIP)

clean:
	-powershell -NoProfile -Command "Get-ChildItem -Filter 'blocky-switch-*.zip' | Remove-Item -Force"
