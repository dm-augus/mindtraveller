param([int]$AppProcessId, [string]$Destination, [switch]$Cancel)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$deadline = (Get-Date).AddSeconds(20)
$dialogWindow = $null
while ((Get-Date) -lt $deadline -and -not $dialogWindow) {
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($candidate in $windows) {
    if ($candidate.Current.ProcessId -eq $AppProcessId -and $candidate.Current.Name -eq 'Export History') { $dialogWindow = $candidate; break }
  }
  if (-not $dialogWindow) { Start-Sleep -Milliseconds 100 }
}
if (-not $dialogWindow) { throw 'Native Export History dialog did not appear.' }
function Find-Control([string]$identifier) {
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $identifier)
  $buttonType = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
  $both = New-Object System.Windows.Automation.AndCondition($condition, $buttonType)
  return $dialogWindow.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $both)
}
$type = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$buttons = $dialogWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$button = $null
foreach ($candidate in $buttons) {
  $label = $candidate.Current.Name.Replace('&', '')
  if (($Cancel -and $label -match '^(Cancel|Cancelar)$') -or (-not $Cancel -and $label -match '^(Save|Salvar)$')) { $button = $candidate; break }
}
if (-not $button) { $all=$dialogWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition); foreach ($item in $all) { Write-Output ($item.Current.Name + ' | ' + $item.Current.ControlType.ProgrammaticName + ' | ' + $item.Current.AutomationId) }; throw 'Native dialog action unavailable.' }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DialogClick { [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }'
$handle = $button.Current.NativeWindowHandle
if ($handle -eq 0) { throw 'Native button handle unavailable.' }
[DialogClick]::SendMessage([IntPtr]$handle, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Write-Output 'Native dialog action completed.'
