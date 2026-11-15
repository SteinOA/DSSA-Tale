!macro customHeader
  ManifestDPIAware true
!macroend

; The Microsoft runtime is obtained by the end user directly from Microsoft.
; It is not repackaged as loose DLLs. Its own interactive installer presents
; Microsoft's terms; never request a silent acceptance or reboot.
!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Minor"
  ${If} $0 != 1
  ${OrIf} $1 < 44
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "DSSA Tale trenger Microsoft Visual C++ Runtime (x64). Installasjonen laster den ned direkte fra Microsoft og åpner Microsofts installasjonsvindu, der du selv leser og godtar vilkårene. Ingen automatisk omstart utføres." IDOK dssa_runtime_download
    Abort "Microsoft Runtime er nødvendig. Kjør installasjonen igjen når den er installert."
    dssa_runtime_download:
    InitPluginsDir
    INetC::get /CONNECTTIMEOUT 30 /RECEIVETIMEOUT 120 "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$PLUGINSDIR\dssa-vc-redist.x64.exe" /END
    Pop $0
    ${If} $0 != "OK"
      Abort "Nedlasting fra Microsoft mislyktes. Prøv igjen når Internett er tilgjengelig."
    ${EndIf}
    System::Call 'kernel32::SetEnvironmentVariable(t "DSSA_VC_RUNTIME_INSTALLER", t "$PLUGINSDIR\dssa-vc-redist.x64.exe") i.r2'
    ${If} $2 == 0
      Abort "Microsoft-kontrollen kunne ikke klargjøres. Filen blir ikke startet."
    ${EndIf}
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "$$s = Get-AuthenticodeSignature -LiteralPath $$env:DSSA_VC_RUNTIME_INSTALLER; if ($$s.Status -ne 'Valid' -or $$s.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(,|$$)') { exit 1 }"`
    Pop $0
    Pop $1
    System::Call 'kernel32::SetEnvironmentVariable(t "DSSA_VC_RUNTIME_INSTALLER", p 0) i.r2'
    ${If} $0 != 0
      Abort "Microsoft-signaturen kunne ikke bekreftes. Filen blir ikke startet."
    ${EndIf}
    ExecWait '"$PLUGINSDIR\dssa-vc-redist.x64.exe" /install /norestart' $0
    ${If} $0 != 0
    ${AndIf} $0 != 1638
    ${AndIf} $0 != 3010
      Abort "Microsoft Runtime ble ikke installert. Kjør DSSA-installasjonen igjen etter at dette er løst."
    ${EndIf}
    ${If} $0 == 3010
      MessageBox MB_OK|MB_ICONINFORMATION "Microsoft Runtime er installert. Windows kan kreve en omstart før DSSA Tale kan brukes. Du velger selv når du starter på nytt."
    ${EndIf}
  ${EndIf}
!macroend

; DSSA deliberately has no upstream uninstall cleanup. The existing OpenWhispr
; profile, cached speech/LLM models and its startup registration must be kept.
