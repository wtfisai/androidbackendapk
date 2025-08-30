// Metrics Bar Component - Shows system metrics in navbar
// This script is included in all pages except the main dashboard

// Check if we're on the main dashboard page
const isMainDashboard = window.location.pathname === '/' || window.location.pathname === '/index.html';

// Initialize metrics bar visibility
document.addEventListener('DOMContentLoaded', () => {
  const metricsBar = document.getElementById('metricsBar');
  if (metricsBar && !isMainDashboard) {
    // Show metrics bar on all pages except main dashboard
    metricsBar.classList.remove('d-none');
    metricsBar.classList.add('d-flex');
    
    // Start updating metrics
    updateAllMetrics();
    setInterval(updateAllMetrics, 30000); // Update every 30 seconds
  }
});

// Update all metrics
async function updateAllMetrics() {
  try {
    // Update system metrics
    const systemResponse = await fetch('/api/system', {
      headers: { 'x-api-key': localStorage.getItem('apiKey') || 'diagnostic-api-key-2024' }
    });
    const system = await systemResponse.json();
    
    if (system) {
      // Update uptime
      const hours = Math.floor(system.uptime / 3600);
      const minutes = Math.floor((system.uptime % 3600) / 60);
      const uptimeMetric = document.getElementById('uptimeMetric');
      if (uptimeMetric) {
        uptimeMetric.textContent = `${hours}h ${minutes}m`;
      }
      
      // Update RAM usage
      const memUsed = ((1 - system.freeMemory / system.totalMemory) * 100).toFixed(1);
      const ramMetric = document.getElementById('ramMetric');
      if (ramMetric) {
        ramMetric.textContent = `${memUsed}%`;
        const ramIcon = ramMetric.previousElementSibling;
        if (ramIcon) {
          const memUsedNum = parseFloat(memUsed);
          ramIcon.className = `bi bi-memory ${memUsedNum > 80 ? 'text-danger' : memUsedNum > 60 ? 'text-warning' : 'text-success'}`;
        }
      }
    }
    
    // Update battery
    const batteryResponse = await fetch('/api/device/battery', {
      headers: { 'x-api-key': localStorage.getItem('apiKey') || 'diagnostic-api-key-2024' }
    });
    const battery = await batteryResponse.json();
    
    if (battery) {
      const level = battery.level || '?';
      const batteryMetric = document.getElementById('batteryMetric');
      if (batteryMetric) {
        batteryMetric.textContent = `${level}%`;
        const batteryIcon = batteryMetric.previousElementSibling;
        if (batteryIcon) {
          const icon = battery.status === 'Charging' ? 'bi-battery-charging' : 'bi-battery-half';
          batteryIcon.className = `bi ${icon} ${level < 20 ? 'text-danger' : level < 50 ? 'text-warning' : 'text-success'}`;
        }
      }
    }
    
    // Update storage
    const storageResponse = await fetch('/api/storage', {
      headers: { 'x-api-key': localStorage.getItem('apiKey') || 'diagnostic-api-key-2024' }
    });
    const storage = await storageResponse.json();
    
    if (storage && storage.storage && storage.storage.length > 0) {
      const mainStorage = storage.storage.find(s => s.mounted === '/data' || s.mounted === '/storage/emulated/0') || storage.storage[0];
      if (mainStorage) {
        const storageMetric = document.getElementById('storageMetric');
        if (storageMetric) {
          const usedPercent = parseInt(mainStorage.usePercent);
          storageMetric.textContent = mainStorage.usePercent;
          const storageIcon = storageMetric.previousElementSibling;
          if (storageIcon) {
            storageIcon.className = `bi bi-hdd-fill ${usedPercent > 90 ? 'text-danger' : usedPercent > 70 ? 'text-warning' : 'text-primary'}`;
          }
        }
      }
    }
    
    // Update network signals
    updateNetworkSignals();
    
  } catch (error) {
    console.error('Error updating metrics:', error);
  }
}

// Update network signal strength
async function updateNetworkSignals() {
  try {
    // Get mobile signal strength
    const mobileResponse = await fetch('/api/shell', {
      method: 'POST',
      headers: {
        'x-api-key': localStorage.getItem('apiKey') || 'diagnostic-api-key-2024',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command: 'dumpsys telephony.registry | grep "mSignalStrength" | head -1' })
    });
    const mobileResult = await mobileResponse.json();
    
    if (mobileResult && mobileResult.output) {
      const signalMatch = mobileResult.output.match(/mSignalStrength=SignalStrength.*?gsm:\s*(\d+)/);
      const gsmSignal = signalMatch ? parseInt(signalMatch[1]) : 0;
      
      // Convert to 0-4 bars scale matching Android
      let mobileBars = 0;
      if (gsmSignal > 0) {
        if (gsmSignal >= 12) mobileBars = 4;
        else if (gsmSignal >= 8) mobileBars = 3;
        else if (gsmSignal >= 5) mobileBars = 2;
        else mobileBars = 1;
      }
      
      const networkSignal = document.getElementById('networkSignal');
      if (networkSignal) {
        networkSignal.innerHTML = `<i class="bi bi-reception-${mobileBars}"></i>`;
      }
    }
    
    // Get WiFi signal strength
    const wifiResponse = await fetch('/api/shell', {
      method: 'POST',
      headers: {
        'x-api-key': localStorage.getItem('apiKey') || 'diagnostic-api-key-2024',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command: 'dumpsys wifi | grep "mWifiInfo" | head -1' })
    });
    const wifiResult = await wifiResponse.json();
    
    if (wifiResult && wifiResult.output) {
      const rssiMatch = wifiResult.output.match(/RSSI:\s*(-?\d+)/);
      const rssi = rssiMatch ? parseInt(rssiMatch[1]) : -100;
      
      // Convert RSSI to WiFi bars (0-3 scale)
      let wifiBars = 'off';
      if (rssi > -100) {
        if (rssi >= -55) wifiBars = '2';  // Strong signal (3 bars)
        else if (rssi >= -70) wifiBars = '1'; // Medium signal (2 bars)
        else if (rssi >= -85) wifiBars = '';  // Weak signal (1 bar)
        // else no bars (off)
      }
      
      const wifiSignal = document.getElementById('wifiSignal');
      if (wifiSignal) {
        wifiSignal.innerHTML = `<i class="bi bi-wifi${wifiBars === 'off' ? '-off' : wifiBars === '' ? '' : `-${wifiBars}`}"></i>`;
      }
    }
  } catch (error) {
    console.error('Error updating network signals:', error);
  }
}