; Default electron-builder check treats ANY process under $INSTDIR as the app
; (orphaned ffmpeg, crash helpers, etc.) and then shows «Не удалось закрыть…»
; even when the main window is not open. Kill only our executable by name.

!macro customCheckAppRunning
  nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
  Pop $R0
  ; Previous builds used productName as the .exe (with spaces)
  nsExec::Exec `taskkill /F /IM "VK Music Installer.exe" /T`
  Pop $R0
  Sleep 500
!macroend
