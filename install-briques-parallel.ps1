# Script to install npm dependencies for briques 1-149 in PARALLEL (faster)
# Usage: powershell -ExecutionPolicy Bypass -File install-briques-parallel.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installing Briques 1-149 (PARALLEL)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will install dependencies for multiple briques at once" -ForegroundColor Yellow
Write-Host ""

$response = Read-Host "Continue? (yes/no)"
if ($response -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
$startTime = Get-Date

# Find all brique directories (1-149)
$briqueDirs = @()

$patterns = @(
    "brique1",
    "brique-*"
)

foreach ($pattern in $patterns) {
    $dirs = Get-ChildItem -Path . -Directory -Filter $pattern -ErrorAction SilentlyContinue
    $briqueDirs += $dirs
}

# Filter to keep only briques 1-149
$filteredBriques = @()
foreach ($dir in $briqueDirs) {
    $name = $dir.Name
    if ($name -match "brique-?(\d+)") {
        $num = [int]$matches[1]
        if ($num -ge 1 -and $num -le 149) {
            # Check for package.json
            $packageJsonPaths = @(
                (Join-Path $dir.FullName "package.json"),
                (Join-Path $dir.FullName "src\package.json"),
                (Join-Path $dir.FullName "backend\package.json"),
                (Join-Path $dir.FullName "server\package.json")
            )

            $foundPackageJson = $null
            foreach ($path in $packageJsonPaths) {
                if (Test-Path $path) {
                    $foundPackageJson = Split-Path $path -Parent
                    break
                }
            }

            if ($foundPackageJson -and -not (Test-Path (Join-Path $foundPackageJson "node_modules"))) {
                $filteredBriques += @{
                    Name = $name
                    Number = $num
                    Path = $foundPackageJson
                }
            }
        }
    }
}

$totalBriques = $filteredBriques.Count
Write-Host "Found $totalBriques briques to install" -ForegroundColor Yellow
Write-Host ""

if ($totalBriques -eq 0) {
    Write-Host "All briques already have dependencies installed!" -ForegroundColor Green
    exit 0
}

# Create jobs for parallel execution
$jobs = @()
$maxConcurrent = 5  # Number of parallel npm installs

Write-Host "Starting parallel installation (max $maxConcurrent at a time)..." -ForegroundColor Cyan
Write-Host ""

$briqueQueue = [System.Collections.Queue]::new($filteredBriques)
$runningJobs = @()
$completed = 0
$failed = 0

while ($briqueQueue.Count -gt 0 -or $runningJobs.Count -gt 0) {
    # Start new jobs if we have capacity
    while ($runningJobs.Count -lt $maxConcurrent -and $briqueQueue.Count -gt 0) {
        $briqueInfo = $briqueQueue.Dequeue()
        $name = $briqueInfo.Name
        $path = $briqueInfo.Path

        Write-Host "Starting: $name" -ForegroundColor Cyan

        $scriptBlock = {
            param($Path, $Name)
            Set-Location $Path
            $output = npm install 2>&1 | Out-String
            return @{
                Name = $Name
                Success = $LASTEXITCODE -eq 0
                Output = $output
            }
        }

        $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList $path, $name
        $runningJobs += @{
            Job = $job
            Name = $name
            StartTime = Get-Date
        }
    }

    # Check for completed jobs
    $stillRunning = @()
    foreach ($jobInfo in $runningJobs) {
        if ($jobInfo.Job.State -eq "Completed") {
            $result = Receive-Job -Job $jobInfo.Job
            Remove-Job -Job $jobInfo.Job

            if ($result.Success) {
                Write-Host "[OK] $($jobInfo.Name)" -ForegroundColor Green
                $completed++
            } else {
                Write-Host "[ERROR] $($jobInfo.Name)" -ForegroundColor Red
                $failed++
            }
        } elseif ($jobInfo.Job.State -eq "Failed") {
            Write-Host "[ERROR] $($jobInfo.Name) - Job failed" -ForegroundColor Red
            Remove-Job -Job $jobInfo.Job
            $failed++
        } else {
            $stillRunning += $jobInfo
        }
    }

    $runningJobs = $stillRunning

    # Progress update
    $total = $completed + $failed + $runningJobs.Count + $briqueQueue.Count
    $progress = $completed + $failed
    Write-Host "Progress: $progress/$total (Running: $($runningJobs.Count), Completed: $completed, Failed: $failed)" -ForegroundColor Yellow

    # Wait a bit before checking again
    Start-Sleep -Milliseconds 500
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Total: $totalBriques briques" -ForegroundColor White
Write-Host "  Success: $completed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor Red
Write-Host "  Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor White
Write-Host ""

if ($failed -gt 0) {
    Write-Host "Some installations failed. You may want to run them individually:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File install-briques-1-149.ps1" -ForegroundColor White
}

Write-Host "Done!" -ForegroundColor Green
