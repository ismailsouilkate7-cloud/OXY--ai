# Test Authentication Flow
Write-Host "Testing VOSIL Authentication System" -ForegroundColor Cyan

# Start server in background
Write-Host "Starting server..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    cd 'c:\Users\souil\Desktop\OXIAI'
    node server.js
} -Name VosilServer

# Wait for server to start
Start-Sleep -Seconds 3

# Test 1: Check if password page is accessible
Write-Host "`nTest 1: GET / should return password page" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/" -Method Get -ErrorAction Stop
    if ($response.Content -match "password" -or $response.Content -match "VOSIL") {
        Write-Host "✓ Password page is accessible" -ForegroundColor Green
    } else {
        Write-Host "✗ Response doesn't look like password page" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to reach server: $_" -ForegroundColor Red
}

# Test 2: Try wrong password
Write-Host "`nTest 2: POST /api/auth/login with wrong password" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method Post `
        -ContentType "application/json" `
        -Body '{"password":"wrongpassword"}' `
        -ErrorAction Stop
    Write-Host "✗ Should have been rejected" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✓ Wrong password correctly rejected (401)" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected response: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# Test 3: Try correct password
Write-Host "`nTest 3: POST /api/auth/login with correct password" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method Post `
        -ContentType "application/json" `
        -Body '{"password":"test123"}' `
        -SessionVariable session `
        -ErrorAction Stop
    
    if ($response.Content -match '"success"\s*:\s*true') {
        Write-Host "✓ Correct password accepted" -ForegroundColor Green
        Write-Host "✓ Session cookie set" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected response" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

# Test 4: Check /chat access with session
Write-Host "`nTest 4: GET /chat with session cookie" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/chat" -Method Get `
        -WebSession $session `
        -ErrorAction Stop
    
    if ($response.Content -match "chat" -or $response.Content -match "VOSIL") {
        Write-Host "✓ Chat page is accessible with session" -ForegroundColor Green
    } else {
        Write-Host "✗ Response doesn't look like chat page" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

# Test 5: Logout
Write-Host "`nTest 5: POST /api/auth/logout" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/logout" -Method Post `
        -WebSession $session `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    if ($response.Content -match '"success"\s*:\s*true') {
        Write-Host "✓ Logout successful" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected response" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

# Stop server
Write-Host "`nStopping server..." -ForegroundColor Yellow
Stop-Job -Job $serverJob | Out-Null
Remove-Job -Job $serverJob | Out-Null

Write-Host "`n✓ Authentication tests completed" -ForegroundColor Green
