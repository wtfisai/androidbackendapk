#!/bin/bash

API_KEY="diagnostic-api-key-2024"
BASE_URL="http://localhost:3000"

echo "================================"
echo "Testing All API Endpoints"
echo "================================"

# Test health endpoint
echo -e "\n[1] Testing Health Endpoint..."
curl -s "$BASE_URL/health" | jq '.status' | grep -q "online" && echo "✓ Health check passed" || echo "✗ Health check failed"

# Test system endpoints
echo -e "\n[2] Testing System Endpoints..."
curl -s "$BASE_URL/api/system" -H "x-api-key: $API_KEY" | jq '.hostname' > /dev/null && echo "✓ System info passed" || echo "✗ System info failed"

# Test device endpoints
echo -e "\n[3] Testing Device Endpoints..."
curl -s "$BASE_URL/api/device/properties" -H "x-api-key: $API_KEY" | jq '.androidVersion' > /dev/null && echo "✓ Device properties passed" || echo "✗ Device properties failed"
curl -s "$BASE_URL/api/device/battery" -H "x-api-key: $API_KEY" | jq '.level' > /dev/null && echo "✓ Battery info passed" || echo "✗ Battery info failed"
curl -s "$BASE_URL/api/device/network" -H "x-api-key: $API_KEY" | jq '.interfaces' > /dev/null && echo "✓ Network info passed" || echo "✗ Network info failed"

# Test root status endpoint
echo -e "\n[4] Testing Root Status..."
curl -s "$BASE_URL/api/root-status" -H "x-api-key: $API_KEY" | jq '.rooted' > /dev/null && echo "✓ Root status passed" || echo "✗ Root status failed"

# Test packages endpoint
echo -e "\n[5] Testing Packages Endpoint..."
curl -s "$BASE_URL/api/packages" -H "x-api-key: $API_KEY" | jq '.count' > /dev/null && echo "✓ Packages list passed" || echo "✗ Packages list failed"

# Test processes endpoint
echo -e "\n[6] Testing Processes Endpoint..."
curl -s "$BASE_URL/api/processes" -H "x-api-key: $API_KEY" | jq '.count' > /dev/null && echo "✓ Processes list passed" || echo "✗ Processes list failed"

# Test storage endpoint
echo -e "\n[7] Testing Storage Endpoint..."
curl -s "$BASE_URL/api/storage" -H "x-api-key: $API_KEY" | jq '.storage' > /dev/null && echo "✓ Storage info passed" || echo "✗ Storage info failed"

# Test logcat endpoint
echo -e "\n[8] Testing Logcat Endpoint..."
curl -s "$BASE_URL/api/logcat?lines=10" -H "x-api-key: $API_KEY" | jq '.logs' > /dev/null && echo "✓ Logcat passed" || echo "✗ Logcat failed"

# Test shell command endpoint with safe command
echo -e "\n[9] Testing Shell Command..."
RESULT=$(curl -s -X POST "$BASE_URL/api/shell" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d '{"command": "echo test"}' | jq -r '.output')
[[ "$RESULT" == *"test"* ]] && echo "✓ Shell command passed" || echo "✗ Shell command failed"

# Test dashboard endpoints
echo -e "\n[10] Testing Dashboard Endpoints..."
curl -s "$BASE_URL/api/dashboard/overview" -H "x-api-key: $API_KEY" | jq '.timestamp' > /dev/null && echo "✓ Dashboard overview passed" || echo "✗ Dashboard overview failed"
curl -s "$BASE_URL/api/dashboard/activities" -H "x-api-key: $API_KEY" | jq '.activities' > /dev/null && echo "✓ Activities passed" || echo "✗ Activities failed"

# Test optimization suggestions
echo -e "\n[11] Testing Optimization Endpoints..."
curl -s "$BASE_URL/api/optimize/suggestions" -H "x-api-key: $API_KEY" | jq '.suggestions' > /dev/null && echo "✓ Optimization suggestions passed" || echo "✗ Optimization suggestions failed"

# Test diagnostic endpoints
echo -e "\n[12] Testing Diagnostic Endpoints..."
curl -s -X POST "$BASE_URL/api/diagnostics/connectivity" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d '{"host": "8.8.8.8"}' | jq '.results' > /dev/null && echo "✓ Connectivity test passed" || echo "✗ Connectivity test failed"

# Test debug endpoints
echo -e "\n[13] Testing Debug Endpoints..."
curl -s "$BASE_URL/api/debug/sessions" -H "x-api-key: $API_KEY" | jq '.sessions' > /dev/null && echo "✓ Debug sessions passed" || echo "✗ Debug sessions failed"

# Test android debug endpoints
echo -e "\n[14] Testing Android Debug Endpoints..."
curl -s "$BASE_URL/api/android-debug/logcat?lines=5" -H "x-api-key: $API_KEY" | jq '.logs' > /dev/null && echo "✓ Android debug logcat passed" || echo "✗ Android debug logcat failed"

# Test profiling endpoints
echo -e "\n[15] Testing Profiling Endpoints..."
curl -s "$BASE_URL/api/profiling/cpu/usage" -H "x-api-key: $API_KEY" | jq '.cpuUsage' > /dev/null && echo "✓ CPU profiling passed" || echo "✗ CPU profiling failed"

# Test files endpoint
echo -e "\n[16] Testing Files Endpoint..."
curl -s "$BASE_URL/api/files/list?path=/storage/emulated/0" -H "x-api-key: $API_KEY" | jq '.files' > /dev/null && echo "✓ Files list passed" || echo "✗ Files list failed"

# Test apps endpoint
echo -e "\n[17] Testing Apps Endpoint..."
curl -s "$BASE_URL/api/apps" -H "x-api-key: $API_KEY" | jq '.apps' > /dev/null && echo "✓ Apps list passed" || echo "✗ Apps list failed"

# Test debug-tools endpoints
echo -e "\n[18] Testing Debug Tools Endpoints..."
curl -s -X POST "$BASE_URL/api/debug-tools/uiautomator/dump" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d '{}' | jq '.success' > /dev/null && echo "✓ UI dump endpoint passed" || echo "✗ UI dump endpoint failed"

echo -e "\n================================"
echo "Testing Complete"
echo "================================"