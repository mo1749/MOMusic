!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "FFFFFF"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "111217"
!endif
!ifndef MUI_DIRECTORYPAGE_BGCOLOR
  !define MUI_DIRECTORYPAGE_BGCOLOR "FFFFFF"
!endif
!ifndef MUI_DIRECTORYPAGE_TEXTCOLOR
  !define MUI_DIRECTORYPAGE_TEXTCOLOR "111217"
!endif
!ifndef MUI_INSTFILESPAGE_COLORS
  !define MUI_INSTFILESPAGE_COLORS "3257F7 FFFFFF"
!endif
!ifndef MUI_FINISHPAGE_LINK_COLOR
  !define MUI_FINISHPAGE_LINK_COLOR "3257F7"
!endif
!ifndef MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE
!endif
!ifndef MUI_HEADERIMAGE_BITMAP_STRETCH
  !define MUI_HEADERIMAGE_BITMAP_STRETCH "FitControl"
!endif
!ifndef MUI_HEADERIMAGE_UNBITMAP_STRETCH
  !define MUI_HEADERIMAGE_UNBITMAP_STRETCH "FitControl"
!endif
!ifndef BUILD_UNINSTALLER
  !ifndef MUI_CUSTOMFUNCTION_GUIINIT
    !define MUI_CUSTOMFUNCTION_GUIINIT MoMusicGuiInit
  !endif
!endif

!include LogicLib.nsh
!include FileFunc.nsh
!include StdUtils.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

!ifdef MOMusic_INSTALL_DIR_NAME
  !define MoMusic_INSTALL_DIR_NAME "${MOMusic_INSTALL_DIR_NAME}"
!endif
!ifdef MOMusic_INSTALL_DIR_NAME_LOWER
  !define MoMusic_INSTALL_DIR_NAME_LOWER "${MOMusic_INSTALL_DIR_NAME_LOWER}"
!endif
!ifdef MOMusic_INSTALL_MARKER
  !define MoMusic_INSTALL_MARKER "${MOMusic_INSTALL_MARKER}"
!endif
!ifdef MOMusic_MARKER_APP_ID
  !define MoMusic_MARKER_APP_ID "${MOMusic_MARKER_APP_ID}"
!endif
!ifdef MOMusic_INSTALL_BRAND
  !define MoMusic_INSTALL_BRAND "${MOMusic_INSTALL_BRAND}"
!endif
!ifdef MOMusic_INSTALL_TITLE
  !define MoMusic_INSTALL_TITLE "${MOMusic_INSTALL_TITLE}"
!endif
!ifdef MOMusic_INSTALL_NOTICE
  !define MoMusic_INSTALL_NOTICE "${MOMusic_INSTALL_NOTICE}"
!endif

!ifndef MoMusic_INSTALL_DIR_NAME
  !define MoMusic_INSTALL_DIR_NAME "MoMusic"
!endif
!ifndef MoMusic_INSTALL_DIR_NAME_LOWER
  !define MoMusic_INSTALL_DIR_NAME_LOWER "MoMusic"
!endif
!ifndef MoMusic_INSTALL_MARKER
  !define MoMusic_INSTALL_MARKER ".MoMusic-install-root"
!endif
!ifndef MoMusic_MARKER_APP_ID
  !define MoMusic_MARKER_APP_ID "com.MoMusic.desktop"
!endif
!ifndef MoMusic_INSTALL_BRAND
  !define MoMusic_INSTALL_BRAND "MoMusic"
!endif
!ifndef MoMusic_INSTALL_TITLE
  !define MoMusic_INSTALL_TITLE "MoMusic 安装"
!endif
!ifndef MoMusic_INSTALL_NOTICE
  !define MoMusic_INSTALL_NOTICE ""
!endif

!ifndef BUILD_UNINSTALLER
  Var MoMusicWelcomePage
  Var MoMusicHeroFont
  Var MoMusicTitleFont
  Var MoMusicBodyFont
  Var MoMusicSmallFont
  Var MoMusicDirectoryPage
  Var MoMusicDirectoryInput
  Var MoMusicSilentUpdate
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
    StrCpy $MoMusicSilentUpdate "0"
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/UPDATE" $R1
    ${IfNot} ${Errors}
      StrCpy $MoMusicSilentUpdate "1"
    ${EndIf}
    Call MoMusicUsePreferredInstallDir
    Call MoMusicDisableUnsafeOldUninstallers
    ${If} ${Silent}
      Call MoMusicValidateInstallDir
    ${EndIf}
  !endif
!macroend

!macro customInstall
  FileOpen $0 "$INSTDIR\${MoMusic_INSTALL_MARKER}" w
  ${IfNot} ${Errors}
    FileWrite $0 "MoMusic install root$\r$\n"
    FileWrite $0 "appId=${MoMusic_MARKER_APP_ID}$\r$\n"
    FileClose $0
  ${EndIf}
  ; 软件内静默更新（/S /UPDATE）：静默模式会跳过完成页的"运行"勾选，
  ; 这里在文件就位后直接启动新版本，保证"更新完成后自动启动新版"
  ${If} $MoMusicSilentUpdate == "1"
    Sleep 600
    StrCpy $0 "$INSTDIR\${PRODUCT_FILENAME}.exe"
    ${If} ${FileExists} "$0"
      ${StdUtils.ExecShellAsUser} $1 "$0" "open" "--updated"
    ${EndIf}
    StrCpy $MoMusicSilentUpdate "0"
  ${EndIf}
!macroend

!macro customRemoveFiles
  Call un.MoMusicRemoveInstalledFiles
!macroend

!macro customWelcomePage
  Page custom MoMusicWelcomeShow
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customPageAfterChangeDir
  Page custom MoMusicDirectoryShow MoMusicDirectoryLeave
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function MoMusicFinishStartApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "MoMusicFinishStartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW MoMusicTintCommonControls
  !insertmacro MUI_PAGE_FINISH
!macroend

!ifndef BUILD_UNINSTALLER
Function MoMusicGuiInit
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4) i .r0'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4) i .r0'
  Call MoMusicTintCommonControls
FunctionEnd

Function MoMusicTintCommonControls
  SetCtlColors $HWNDPARENT "111217" "FFFFFF"

  GetDlgItem $0 $HWNDPARENT 1
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 2
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 3
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1028
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1256
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1034
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1035
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1037
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1038
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1039
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}

  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"

    GetDlgItem $1 $0 1000
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1001
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1004
    ${If} $1 <> 0
      SetCtlColors $1 "3257F7" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1006
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1016
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1019
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1020
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1023
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1024
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1027
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1201
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1202
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1203
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1204
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function MoMusicUsePreferredInstallDir
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/D=" $R1
  ${IfNot} ${Errors}
  ${AndIf} $R1 != ""
    StrCpy $INSTDIR "$R1"
  ${Else}
    Call MoMusicUseRegisteredInstallDir
    Pop $R2
    ${If} $R2 != "1"
      Call MoMusicUseFirstAvailableInstallDir
    ${EndIf}
  ${EndIf}
  Push "$INSTDIR"
  Call MoMusicNormalizeInstallDir
  Pop $INSTDIR
FunctionEnd

Function MoMusicUseFirstAvailableInstallDir
  IfFileExists "D:\*.*" driveD 0
  IfFileExists "E:\*.*" driveE 0
  IfFileExists "F:\*.*" driveF 0
  IfFileExists "G:\*.*" driveG 0
  IfFileExists "H:\*.*" driveH 0
  IfFileExists "I:\*.*" driveI 0
  IfFileExists "J:\*.*" driveJ 0
  IfFileExists "K:\*.*" driveK 0
  IfFileExists "L:\*.*" driveL 0
  IfFileExists "M:\*.*" driveM 0
  IfFileExists "N:\*.*" driveN 0
  IfFileExists "O:\*.*" driveO 0
  IfFileExists "P:\*.*" driveP 0
  IfFileExists "Q:\*.*" driveQ 0
  IfFileExists "R:\*.*" driveR 0
  IfFileExists "S:\*.*" driveS 0
  IfFileExists "T:\*.*" driveT 0
  IfFileExists "U:\*.*" driveU 0
  IfFileExists "V:\*.*" driveV 0
  IfFileExists "W:\*.*" driveW 0
  IfFileExists "X:\*.*" driveX 0
  IfFileExists "Y:\*.*" driveY 0
  IfFileExists "Z:\*.*" driveZ 0
  StrCpy $INSTDIR "C:\${MoMusic_INSTALL_DIR_NAME}"
  Return

  driveD:
    StrCpy $INSTDIR "D:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveE:
    StrCpy $INSTDIR "E:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveF:
    StrCpy $INSTDIR "F:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveG:
    StrCpy $INSTDIR "G:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveH:
    StrCpy $INSTDIR "H:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveI:
    StrCpy $INSTDIR "I:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveJ:
    StrCpy $INSTDIR "J:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveK:
    StrCpy $INSTDIR "K:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveL:
    StrCpy $INSTDIR "L:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveM:
    StrCpy $INSTDIR "M:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveN:
    StrCpy $INSTDIR "N:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveO:
    StrCpy $INSTDIR "O:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveP:
    StrCpy $INSTDIR "P:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveQ:
    StrCpy $INSTDIR "Q:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveR:
    StrCpy $INSTDIR "R:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveS:
    StrCpy $INSTDIR "S:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveT:
    StrCpy $INSTDIR "T:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveU:
    StrCpy $INSTDIR "U:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveV:
    StrCpy $INSTDIR "V:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveW:
    StrCpy $INSTDIR "W:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveX:
    StrCpy $INSTDIR "X:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveY:
    StrCpy $INSTDIR "Y:\${MoMusic_INSTALL_DIR_NAME}"
    Return
  driveZ:
    StrCpy $INSTDIR "Z:\${MoMusic_INSTALL_DIR_NAME}"
    Return
FunctionEnd

Function MoMusicHasPreferredInstallDrive
  IfFileExists "D:\*.*" hasPreferred 0
  IfFileExists "E:\*.*" hasPreferred 0
  IfFileExists "F:\*.*" hasPreferred 0
  IfFileExists "G:\*.*" hasPreferred 0
  IfFileExists "H:\*.*" hasPreferred 0
  IfFileExists "I:\*.*" hasPreferred 0
  IfFileExists "J:\*.*" hasPreferred 0
  IfFileExists "K:\*.*" hasPreferred 0
  IfFileExists "L:\*.*" hasPreferred 0
  IfFileExists "M:\*.*" hasPreferred 0
  IfFileExists "N:\*.*" hasPreferred 0
  IfFileExists "O:\*.*" hasPreferred 0
  IfFileExists "P:\*.*" hasPreferred 0
  IfFileExists "Q:\*.*" hasPreferred 0
  IfFileExists "R:\*.*" hasPreferred 0
  IfFileExists "S:\*.*" hasPreferred 0
  IfFileExists "T:\*.*" hasPreferred 0
  IfFileExists "U:\*.*" hasPreferred 0
  IfFileExists "V:\*.*" hasPreferred 0
  IfFileExists "W:\*.*" hasPreferred 0
  IfFileExists "X:\*.*" hasPreferred 0
  IfFileExists "Y:\*.*" hasPreferred 0
  IfFileExists "Z:\*.*" hasPreferred 0
  Push "0"
  Return

  hasPreferred:
    Push "1"
    Return
FunctionEnd

Function MoMusicNormalizeInstallDir
  Exch $0
  Push "$0"
  Call MoMusicTrimInstallDir
  Pop $0
  StrLen $4 "${MoMusic_INSTALL_DIR_NAME}"
  StrLen $1 "$0"
  ${If} $1 == 2
    StrCpy $2 "$0" 1 1
    ${If} $2 == ":"
      StrCpy $0 "$0\${MoMusic_INSTALL_DIR_NAME}"
    ${EndIf}
  ${ElseIf} $1 == 3
    StrCpy $2 "$0" 1 1
    StrCpy $3 "$0" 1 2
    ${If} $2 == ":"
    ${AndIf} $3 == "\"
      StrCpy $0 "$0${MoMusic_INSTALL_DIR_NAME}"
    ${EndIf}
  ${EndIf}

  StrLen $1 "$0"
  IntOp $5 $4 + 1
  StrCpy $2 "$0" $5 -$5
  ${If} $1 < $5
  ${OrIf} $2 != "\${MoMusic_INSTALL_DIR_NAME}"
  ${AndIf} $2 != "\${MoMusic_INSTALL_DIR_NAME_LOWER}"
    StrCpy $0 "$0\${MoMusic_INSTALL_DIR_NAME}"
  ${EndIf}
  Exch $0
FunctionEnd

Function MoMusicTrimInstallDir
  Exch $0

  trim:
    StrLen $1 "$0"
    ${If} $1 > 3
      StrCpy $2 "$0" 1 -1
      ${If} $2 == "\"
        StrCpy $0 "$0" -1
        Goto trim
      ${EndIf}
    ${EndIf}

  Exch $0
FunctionEnd

Function MoMusicInstallDirLooksOwned
  Exch $0
  StrCpy $1 "0"

  IfFileExists "$0\${MoMusic_INSTALL_MARKER}" 0 +2
    StrCpy $1 "1"

  StrCpy $0 "$1"
  Exch $0
FunctionEnd

Function MoMusicExistingInstallPathCanBeAdopted
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call MoMusicTrimInstallDir
  Pop $2
  ${If} $2 == ""
    Goto done
  ${EndIf}

  Push "$2"
  Call MoMusicNormalizeInstallDir
  Pop $3
  ${If} $2 != $3
    Goto done
  ${EndIf}

  IfFileExists "$2\*.*" 0 done
  IfFileExists "$2\${MoMusic_INSTALL_MARKER}" adopt 0
  IfFileExists "$2\${PRODUCT_FILENAME}.exe" adopt 0
  IfFileExists "$2\resources\app.asar" adopt 0
  IfFileExists "$2\resources\app\package.json" adopt 0
  IfFileExists "$2\resources\app\server.js" adopt 0
  Goto done

  adopt:
    StrCpy $1 "1"

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function MoMusicUseRegisteredInstallDir
  ReadRegStr $0 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MoMusicNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MoMusicNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  ReadRegStr $0 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MoMusicNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $1
  ${If} $1 == "1"
    Push "$0"
    Call MoMusicNormalizeInstallDir
    Pop $INSTDIR
    Push "1"
    Return
  ${EndIf}

  Push "0"
FunctionEnd

Function MoMusicRegisteredInstallDirCanBeAdopted
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call MoMusicNormalizeInstallDir
  Pop $2

  ReadRegStr $3 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$3"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MoMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$3"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MoMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$3"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MoMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$3"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call MoMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function MoMusicInstallDirIsEmpty
  Exch $0
  FindFirst $1 $2 "$0\*.*"
  StrCpy $3 "1"

  loop:
    StrCmp $2 "" done
    StrCmp $2 "." next
    StrCmp $2 ".." next
    StrCpy $3 "0"
    Goto done

  next:
    FindNext $1 $2
    Goto loop

  done:
    FindClose $1
    StrCpy $0 "$3"
    Exch $0
FunctionEnd

Function MoMusicOldInstallPathNeedsQuarantine
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call MoMusicTrimInstallDir
  Pop $2
  Push "$2"
  Call MoMusicNormalizeInstallDir
  Pop $3

  ${If} $2 != $3
    StrCpy $1 "1"
    Goto done
  ${EndIf}

  IfFileExists "$2\${MoMusic_INSTALL_MARKER}" done 0
  Push "$2"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Goto done
  ${EndIf}

  StrCpy $1 "1"

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function MoMusicDisableUnsafeOldUninstallers
  StrCpy $2 "0"

  ReadRegStr $0 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call MoMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call MoMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy MoMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call MoMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call MoMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy MoMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ${If} $2 == "1"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
    DeleteRegKey HKCU "Software\${APP_GUID}"
  ${EndIf}

  StrCpy $2 "0"

  ReadRegStr $0 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call MoMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call MoMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy MoMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call MoMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call MoMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy MoMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ${If} $2 == "1"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
    DeleteRegKey HKLM "Software\${APP_GUID}"
  ${EndIf}
FunctionEnd

Function MoMusicDeleteLegacyUninstallerFileIfMissingMarker
  Pop $0
  ${If} $0 != ""
    Push "$0"
    Call MoMusicTrimInstallDir
    Pop $1
    ${If} $1 != ""
      IfFileExists "$1\${MoMusic_INSTALL_MARKER}" done 0
      DetailPrint "Remove legacy MoMusic uninstaller file: $1"
      Delete "$1\Uninstall ${PRODUCT_FILENAME}.exe"
    ${EndIf}
  ${EndIf}

  done:
FunctionEnd

Function MoMusicValidateInstallDir
  Push "$INSTDIR"
  Call MoMusicNormalizeInstallDir
  Pop $INSTDIR

  Push "$INSTDIR"
  Call MoMusicRegisteredInstallDirCanBeAdopted
  Pop $3

  Push "$INSTDIR"
  Call MoMusicExistingInstallPathCanBeAdopted
  Pop $4

  StrCpy $0 "$INSTDIR" 1 0
  StrCpy $1 "$INSTDIR" 1 1
  ${If} $1 == ":"
    ${If} $0 == "C"
    ${OrIf} $0 == "c"
      Call MoMusicHasPreferredInstallDrive
      Pop $2
      ${If} $2 == "1"
      ${AndIf} $3 != "1"
      ${AndIf} $4 != "1"
        MessageBox MB_ICONSTOP|MB_OK "检测到这台电脑还有 D-Z 盘，MoMusic 不安装到 C 盘。请改选 D 盘或其它非 C 盘的 MoMusic 文件夹。$\r$\n$\r$\n如果电脑只有 C 盘，安装器会自动放行 C:\MoMusic。"
        Abort
      ${EndIf}
    ${EndIf}
  ${EndIf}

  StrLen $0 "$INSTDIR"
  StrLen $2 "${MoMusic_INSTALL_DIR_NAME}"
  IntOp $2 $2 + 1
  StrCpy $1 "$INSTDIR" $2 -$2
  ${If} $0 < $2
  ${OrIf} $1 != "\${MoMusic_INSTALL_DIR_NAME}"
  ${AndIf} $1 != "\${MoMusic_INSTALL_DIR_NAME_LOWER}"
    MessageBox MB_ICONSTOP|MB_OK "安装目录必须是独立的 MoMusic 文件夹。请选择一个上级目录，安装器会自动创建 MoMusic 子文件夹。"
    Abort
  ${EndIf}

  IfFileExists "$INSTDIR\*.*" 0 valid

  Push "$INSTDIR"
  Call MoMusicInstallDirLooksOwned
  Pop $0
  ${If} $0 == "1"
    Goto valid
  ${EndIf}

  ${If} $3 == "1"
    Goto valid
  ${EndIf}

  ${If} $4 == "1"
    Goto valid
  ${EndIf}

  Push "$INSTDIR"
  Call MoMusicInstallDirIsEmpty
  Pop $0
  ${If} $0 == "1"
    Goto valid
  ${EndIf}

  MessageBox MB_ICONSTOP|MB_OK "为避免卸载时误删其它文件，MoMusic 不能安装到已有文件的非专属目录。请新建或选择一个空的 MoMusic 文件夹。$\r$\n$\r$\n当前路径：$INSTDIR"
  Abort

  valid:
FunctionEnd
Function MoMusicWelcomeShow
  Call MoMusicUsePreferredInstallDir

  nsDialogs::Create 1018
  Pop $MoMusicWelcomePage
  ${If} $MoMusicWelcomePage == error
    Abort
  ${EndIf}

  SetCtlColors $MoMusicWelcomePage "111217" "FFFFFF"
  CreateFont $MoMusicHeroFont "Microsoft YaHei UI" 24 700
  CreateFont $MoMusicTitleFont "Microsoft YaHei UI" 11 700
  CreateFont $MoMusicBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $MoMusicSmallFont "Microsoft YaHei UI" 8 400

  ${NSD_CreateLabel} 22u 20u 120u 10u "${MoMusic_INSTALL_BRAND}"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicSmallFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  ${NSD_CreateLabel} 22u 42u 226u 30u "${MoMusic_INSTALL_TITLE}"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicHeroFont 1
  SetCtlColors $0 "111217" "FFFFFF"

  ${NSD_CreateLabel} 22u 78u 36u 2u ""
  Pop $0
  SetCtlColors $0 "" "3257F7"

  ${NSD_CreateLabel} 22u 96u 238u 24u "为这台电脑安装 ${PRODUCT_NAME}。默认安装到 D:\${MoMusic_INSTALL_DIR_NAME}，下一步可以自由选择其它位置。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicBodyFont 1
  SetCtlColors $0 "4B5263" "FFFFFF"

  ${NSD_CreateLabel} 22u 130u 238u 12u "默认位置：$INSTDIR"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicTitleFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  !ifdef MoMusic_INTERNAL_BETA
    ${NSD_CreateLabel} 22u 150u 238u 28u "${MoMusic_INSTALL_NOTICE}"
    Pop $0
    SendMessage $0 ${WM_SETFONT} $MoMusicSmallFont 1
    SetCtlColors $0 "B42318" "FFFFFF"
  !endif

  nsDialogs::Show
FunctionEnd

Function MoMusicDirectoryBrowse
  nsDialogs::SelectFolderDialog "选择 ${PRODUCT_NAME} 安装文件夹" "$INSTDIR"
  Pop $0
  ${If} $0 != error
  ${AndIf} $0 != ""
    Push "$0"
    Call MoMusicNormalizeInstallDir
    Pop $0
    StrCpy $INSTDIR "$0"
    SendMessage $MoMusicDirectoryInput ${WM_SETTEXT} 0 "STR:$INSTDIR"
  ${EndIf}
FunctionEnd

Function MoMusicDirectoryShow
  Call MoMusicUsePreferredInstallDir

  nsDialogs::Create 1018
  Pop $MoMusicDirectoryPage
  ${If} $MoMusicDirectoryPage == error
    Abort
  ${EndIf}

  SetCtlColors $MoMusicDirectoryPage "111217" "FFFFFF"
  CreateFont $MoMusicTitleFont "Microsoft YaHei UI" 15 700
  CreateFont $MoMusicBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $MoMusicSmallFont "Microsoft YaHei UI" 8 500

  ${NSD_CreateLabel} 22u 12u 238u 20u "选择安装位置"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicTitleFont 1
  SetCtlColors $0 "111217" "FFFFFF"

  ${NSD_CreateLabel} 22u 40u 238u 24u "你可以使用默认路径，也可以选择其它磁盘或文件夹。安装器会自动创建缺失的目录。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicBodyFont 1
  SetCtlColors $0 "4B5263" "FFFFFF"

  ${NSD_CreateLabel} 22u 76u 238u 10u "安装目录"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicSmallFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  ${NSD_CreateText} 22u 94u 178u 15u "$INSTDIR"
  Pop $MoMusicDirectoryInput
  SendMessage $MoMusicDirectoryInput ${WM_SETFONT} $MoMusicBodyFont 1
  SetCtlColors $MoMusicDirectoryInput "111217" "FFFFFF"

  ${NSD_CreateBrowseButton} 210u 93u 50u 17u "浏览..."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicSmallFont 1
  ${NSD_OnClick} $0 MoMusicDirectoryBrowse

  ${NSD_CreateLabel} 22u 122u 238u 12u "默认推荐：D:\${MoMusic_INSTALL_DIR_NAME}；选盘符会自动建文件夹。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $MoMusicSmallFont 1
  SetCtlColors $0 "6B7280" "FFFFFF"

  nsDialogs::Show
FunctionEnd

Function MoMusicDirectoryLeave
  ${NSD_GetText} $MoMusicDirectoryInput $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "请选择安装文件夹。"
    Abort
  ${EndIf}
  Push "$0"
  Call MoMusicNormalizeInstallDir
  Pop $0
  StrCpy $INSTDIR "$0"
  SendMessage $MoMusicDirectoryInput ${WM_SETTEXT} 0 "STR:$INSTDIR"
  Call MoMusicValidateInstallDir
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
!macro customUnInit
  Call un.MoMusicValidateUninstallDir
!macroend

Function un.MoMusicInstallDirLooksOwned
  Exch $0
  StrCpy $1 "0"

  IfFileExists "$0\${MoMusic_INSTALL_MARKER}" 0 +2
    StrCpy $1 "1"

  StrCpy $0 "$1"
  Exch $0
FunctionEnd

Function un.MoMusicNormalizeInstallDir
  Exch $0
  Push "$0"
  Call un.MoMusicTrimInstallDir
  Pop $0
  StrLen $4 "${MoMusic_INSTALL_DIR_NAME}"
  StrLen $1 "$0"
  ${If} $1 == 2
    StrCpy $2 "$0" 1 1
    ${If} $2 == ":"
      StrCpy $0 "$0\${MoMusic_INSTALL_DIR_NAME}"
    ${EndIf}
  ${ElseIf} $1 == 3
    StrCpy $2 "$0" 1 1
    StrCpy $3 "$0" 1 2
    ${If} $2 == ":"
    ${AndIf} $3 == "\"
      StrCpy $0 "$0${MoMusic_INSTALL_DIR_NAME}"
    ${EndIf}
  ${EndIf}

  StrLen $1 "$0"
  IntOp $5 $4 + 1
  StrCpy $2 "$0" $5 -$5
  ${If} $1 < $5
  ${OrIf} $2 != "\${MoMusic_INSTALL_DIR_NAME}"
  ${AndIf} $2 != "\${MoMusic_INSTALL_DIR_NAME_LOWER}"
    StrCpy $0 "$0\${MoMusic_INSTALL_DIR_NAME}"
  ${EndIf}
  Exch $0
FunctionEnd

Function un.MoMusicTrimInstallDir
  Exch $0

  trim:
    StrLen $1 "$0"
    ${If} $1 > 3
      StrCpy $2 "$0" 1 -1
      ${If} $2 == "\"
        StrCpy $0 "$0" -1
        Goto trim
      ${EndIf}
    ${EndIf}

  Exch $0
FunctionEnd

Function un.MoMusicValidateUninstallDir
  Push "$INSTDIR"
  Call un.MoMusicTrimInstallDir
  Pop $0
  Push "$0"
  Call un.MoMusicNormalizeInstallDir
  Pop $1
  ${If} $0 != $1
    MessageBox MB_OK|MB_ICONSTOP "当前卸载路径不是 MoMusic 专属目录，已阻止卸载以避免误删其它文件。$\r$\n$\r$\n当前路径：$INSTDIR$\r$\n安全路径应为：$0"
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $INSTDIR "$0"

  Push "$INSTDIR"
  Call un.MoMusicInstallDirLooksOwned
  Pop $0
  ${If} $0 != "1"
    MessageBox MB_OK|MB_ICONSTOP "无法确认当前目录属于 MoMusic，已阻止卸载以避免误删其它文件。$\r$\n$\r$\n当前路径：$INSTDIR"
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

Function un.MoMusicRemoveInstalledFiles
  SetOutPath $TEMP

  Delete "$INSTDIR\${PRODUCT_FILENAME}.exe"
  Delete "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
  Delete "$INSTDIR\uninstallerIcon.ico"

  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vulkan-1.dll"

  RMDir "$INSTDIR\locales"
  RMDir "$INSTDIR\resources"
  RMDir "$INSTDIR\swiftshader"

  RMDir "$INSTDIR"
FunctionEnd
!endif
