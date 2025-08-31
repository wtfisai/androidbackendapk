const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const dns = require('dns');
const net = require('net');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');
const execAsync = promisify(exec);
const dnsLookup = promisify(dns.lookup);

// Helper function for ping test
async function pingTest(host, count = 4) {
  try {
    const { stdout } = await execAsync(`ping -c ${count} ${host}`);
    const lines = stdout.split('\n');

    // Parse ping statistics
    const statsLine = lines.find((l) => l.includes('min/avg/max'));
    let stats = null;

    if (statsLine) {
      const match = statsLine.match(/(\d+\.?\d*)/g);
      if (match && match.length >= 3) {
        stats = {
          min: parseFloat(match[0]),
          avg: parseFloat(match[1]),
          max: parseFloat(match[2])
        };
      }
    }

    // Parse packet loss
    const lossLine = lines.find((l) => l.includes('packet loss'));
    let packetLoss = 0;
    if (lossLine) {
      const lossMatch = lossLine.match(/(\d+)% packet loss/);
      if (lossMatch) {
        packetLoss = parseInt(lossMatch[1]);
      }
    }

    return {
      host,
      reachable: packetLoss < 100,
      packetLoss,
      latency: stats,
      raw: stdout
    };
  } catch (error) {
    return {
      host,
      reachable: false,
      error: error.message
    };
  }
}

// Helper function for traceroute
async function traceroute(host, maxHops = 30) {
  try {
    const { stdout } = await execAsync(`traceroute -m ${maxHops} ${host}`);
    const lines = stdout.split('\n').filter((l) => l.trim());
    const hops = [];

    for (const line of lines.slice(1)) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (match) {
        const hopNumber = parseInt(match[1]);
        const hopData = match[2].trim();

        // Parse hop details
        const ipMatch = hopData.match(/\(([^)]+)\)/);
        const timings = hopData.match(/(\d+\.?\d*)\s*ms/g);

        hops.push({
          hop: hopNumber,
          address: ipMatch ? ipMatch[1] : 'unknown',
          times: timings ? timings.map((t) => parseFloat(t)) : [],
          raw: hopData
        });
      }
    }

    return {
      host,
      hops,
      totalHops: hops.length
    };
  } catch (error) {
    return {
      host,
      error: error.message
    };
  }
}

// Helper function for port scanning
async function scanPort(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, open: true });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, open: false, reason: 'timeout' });
    });

    socket.on('error', (err) => {
      resolve({ port, open: false, reason: err.code });
    });

    socket.connect(port, host);
  });
}

// POST /api/diagnostics/connectivity
router.post('/connectivity', authenticateApiKey, async (req, res) => {
  try {
    const tests = [];

    // Test DNS resolution
    const dnsServers = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
    const dnsTests = await Promise.all(
      dnsServers.map(async (server) => {
        try {
          const start = Date.now();
          await dnsLookup('google.com', { family: 4 });
          const responseTime = Date.now() - start;
          return { server, status: 'ok', responseTime };
        } catch (error) {
          return { server, status: 'failed', error: error.message };
        }
      })
    );

    tests.push({
      type: 'DNS',
      results: dnsTests,
      summary: dnsTests.some((t) => t.status === 'ok') ? 'Working' : 'Failed'
    });

    // Test internet connectivity
    const connectivityTargets = [
      { name: 'Google DNS', host: '8.8.8.8' },
      { name: 'Cloudflare', host: '1.1.1.1' },
      { name: 'Google', host: 'google.com' }
    ];

    const connectivityTests = await Promise.all(
      connectivityTargets.map((target) => pingTest(target.host, 2))
    );

    tests.push({
      type: 'Internet Connectivity',
      results: connectivityTests,
      summary: connectivityTests.some((t) => t.reachable) ? 'Connected' : 'Disconnected'
    });

    // Test local network
    try {
      const { stdout: gateway } = await execAsync("ip route | grep default | awk '{print $3}'");
      const gatewayIp = gateway.trim();

      if (gatewayIp) {
        const gatewayPing = await pingTest(gatewayIp, 2);
        tests.push({
          type: 'Local Network',
          gateway: gatewayIp,
          result: gatewayPing,
          summary: gatewayPing.reachable ? 'Connected' : 'Disconnected'
        });
      }
    } catch (error) {
      tests.push({
        type: 'Local Network',
        error: error.message,
        summary: 'Unknown'
      });
    }

    // Get network interfaces status
    try {
      const { stdout } = await execAsync('ip addr show');
      const interfaces = [];
      const interfaceBlocks = stdout.split(/^\d+:/m);

      for (const block of interfaceBlocks.slice(1)) {
        const nameMatch = block.match(/^\s*([^:]+):/);
        const ipMatch = block.match(/inet\s+([^\/]+)/);
        const stateMatch = block.match(/state\s+(\w+)/);

        if (nameMatch) {
          interfaces.push({
            name: nameMatch[1].trim(),
            ip: ipMatch ? ipMatch[1] : 'No IP',
            state: stateMatch ? stateMatch[1] : 'unknown'
          });
        }
      }

      tests.push({
        type: 'Network Interfaces',
        interfaces,
        summary: interfaces.some((i) => i.state === 'UP') ? 'Active' : 'No active interfaces'
      });
    } catch (error) {
      tests.push({
        type: 'Network Interfaces',
        error: error.message,
        summary: 'Error'
      });
    }

    // Overall diagnosis
    const diagnosis = {
      timestamp: new Date(),
      tests,
      overall: {
        internetAccess:
          tests.find((t) => t.type === 'Internet Connectivity')?.summary === 'Connected',
        dnsWorking: tests.find((t) => t.type === 'DNS')?.summary === 'Working',
        localNetwork: tests.find((t) => t.type === 'Local Network')?.summary === 'Connected',
        hasActiveInterface: tests.find((t) => t.type === 'Network Interfaces')?.summary === 'Active'
      }
    };

    // Generate recommendations
    const recommendations = [];

    if (!diagnosis.overall.internetAccess) {
      recommendations.push(
        'No internet connectivity detected. Check your WiFi or mobile data connection.'
      );
    }

    if (!diagnosis.overall.dnsWorking) {
      recommendations.push('DNS resolution failing. Try changing DNS servers in network settings.');
    }

    if (!diagnosis.overall.localNetwork) {
      recommendations.push('Cannot reach local gateway. Check router connection.');
    }

    if (!diagnosis.overall.hasActiveInterface) {
      recommendations.push('No active network interfaces. Enable WiFi or mobile data.');
    }

    diagnosis.recommendations = recommendations;

    // Log the diagnostic activity
    await Activity.log({
      type: 'diagnostic',
      action: 'network_diagnosis',
      metadata: { diagnosis }
    });

    res.json(diagnosis);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to diagnose connectivity',
      message: error.message
    });
  }
});

// POST /api/diagnostics/traceroute
router.post('/traceroute', authenticateApiKey, async (req, res) => {
  const { host, maxHops = 30 } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Host is required' });
  }

  try {
    const result = await traceroute(host, maxHops);

    // Analyze the route
    const analysis = {
      totalHops: result.hops ? result.hops.length : 0,
      avgLatency: 0,
      maxLatency: 0,
      possibleIssues: []
    };

    if (result.hops) {
      const allTimes = result.hops.flatMap((h) => h.times).filter((t) => t);
      if (allTimes.length > 0) {
        analysis.avgLatency = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
        analysis.maxLatency = Math.max(...allTimes);
      }

      // Check for potential issues
      result.hops.forEach((hop, index) => {
        if (hop.times.length === 0) {
          analysis.possibleIssues.push(`Hop ${hop.hop}: No response (possible firewall)`);
        } else if (hop.times.some((t) => t > 500)) {
          analysis.possibleIssues.push(`Hop ${hop.hop}: High latency detected`);
        }
      });
    }

    res.json({
      ...result,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      error: 'Traceroute failed',
      message: error.message
    });
  }
});

// POST /api/diagnostics/port-scan
router.post('/port-scan', authenticateApiKey, async (req, res) => {
  const { host, ports, timeout = 2000 } = req.body;

  if (!host || !ports || !Array.isArray(ports)) {
    return res.status(400).json({
      error: 'Host and ports array are required'
    });
  }

  if (ports.length > 100) {
    return res.status(400).json({
      error: 'Maximum 100 ports allowed per scan'
    });
  }

  try {
    const results = await Promise.all(ports.map((port) => scanPort(host, port, timeout)));

    const openPorts = results.filter((r) => r.open).map((r) => r.port);
    const closedPorts = results.filter((r) => !r.open).map((r) => r.port);

    // Common port identification
    const commonPorts = {
      21: 'FTP',
      22: 'SSH',
      23: 'Telnet',
      25: 'SMTP',
      53: 'DNS',
      80: 'HTTP',
      110: 'POP3',
      143: 'IMAP',
      443: 'HTTPS',
      445: 'SMB',
      3306: 'MySQL',
      3389: 'RDP',
      5432: 'PostgreSQL',
      6379: 'Redis',
      8080: 'HTTP Alternate',
      8443: 'HTTPS Alternate',
      27017: 'MongoDB'
    };

    const identifiedServices = openPorts.map((port) => ({
      port,
      service: commonPorts[port] || 'Unknown'
    }));

    res.json({
      host,
      scanned: ports.length,
      open: openPorts,
      closed: closedPorts,
      services: identifiedServices,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Port scan failed',
      message: error.message
    });
  }
});

// GET /api/diagnostics/bandwidth
router.get('/bandwidth', authenticateApiKey, async (req, res) => {
  try {
    // Get network statistics
    const { stdout } = await execAsync('cat /proc/net/dev');
    const lines = stdout.split('\n');

    const interfaces = {};

    for (const line of lines.slice(2)) {
      if (line.trim()) {
        const parts = line.trim().split(/\s+/);
        const ifaceName = parts[0].replace(':', '');

        interfaces[ifaceName] = {
          received: {
            bytes: parseInt(parts[1]),
            packets: parseInt(parts[2]),
            errors: parseInt(parts[3]),
            dropped: parseInt(parts[4])
          },
          transmitted: {
            bytes: parseInt(parts[9]),
            packets: parseInt(parts[10]),
            errors: parseInt(parts[11]),
            dropped: parseInt(parts[12])
          }
        };
      }
    }

    // Calculate bandwidth usage (simplified - would need periodic sampling for real bandwidth)
    const bandwidthInfo = {};

    for (const [name, stats] of Object.entries(interfaces)) {
      if (name !== 'lo') {
        // Skip loopback
        bandwidthInfo[name] = {
          totalReceived: (stats.received.bytes / (1024 * 1024)).toFixed(2) + ' MB',
          totalTransmitted: (stats.transmitted.bytes / (1024 * 1024)).toFixed(2) + ' MB',
          packetsReceived: stats.received.packets,
          packetsTransmitted: stats.transmitted.packets,
          errors: stats.received.errors + stats.transmitted.errors,
          dropped: stats.received.dropped + stats.transmitted.dropped
        };
      }
    }

    res.json({
      interfaces: bandwidthInfo,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get bandwidth information',
      message: error.message
    });
  }
});

// POST /api/diagnostics/wifi
router.post('/wifi/scan', authenticateApiKey, async (req, res) => {
  try {
    // Try to scan for WiFi networks (requires WiFi to be on)
    const { stdout } = await execAsync('termux-wifi-scaninfo 2>/dev/null || echo "[]"');

    let networks = [];
    try {
      networks = JSON.parse(stdout);
    } catch (e) {
      // If termux-api is not available, try alternative method
      try {
        const { stdout: iwlist } = await execAsync(
          'iwlist wlan0 scan 2>/dev/null | grep -E "ESSID|Signal|Encryption"'
        );
        const lines = iwlist.split('\n');

        let currentNetwork = {};
        for (const line of lines) {
          if (line.includes('ESSID')) {
            if (currentNetwork.ssid) {
              networks.push(currentNetwork);
            }
            currentNetwork = {
              ssid: line.match(/"([^"]+)"/)?.[1] || 'Hidden',
              signal: 0,
              security: 'Unknown'
            };
          } else if (line.includes('Signal')) {
            const match = line.match(/-(\d+)/);
            if (match) {
              currentNetwork.signal = parseInt(match[1]);
            }
          } else if (line.includes('Encryption')) {
            currentNetwork.security = line.includes('on') ? 'Secured' : 'Open';
          }
        }
        if (currentNetwork.ssid) {
          networks.push(currentNetwork);
        }
      } catch (innerError) {
        // Fallback to showing current connection only
        const { stdout: current } = await execAsync(
          'termux-wifi-connectioninfo 2>/dev/null || echo "{}"'
        );
        try {
          const currentInfo = JSON.parse(current);
          if (currentInfo.ssid) {
            networks = [
              {
                ssid: currentInfo.ssid,
                signal: currentInfo.rssi || 0,
                security: 'Connected',
                current: true
              }
            ];
          }
        } catch (e) {
          networks = [];
        }
      }
    }

    // Sort by signal strength
    networks.sort((a, b) => (b.signal || 0) - (a.signal || 0));

    res.json({
      networks,
      count: networks.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to scan WiFi networks',
      message: error.message,
      hint: 'Make sure WiFi is enabled and termux-api is installed'
    });
  }
});

// GET /api/diagnostics/speed-test
router.get('/speed-test', authenticateApiKey, async (req, res) => {
  try {
    // Simple speed test using curl to download a test file
    const testUrls = [
      { name: 'Cloudflare', url: 'https://speed.cloudflare.com/__down?bytes=10000000', size: 10 },
      {
        name: 'Google',
        url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
        size: 0.013
      }
    ];

    const results = [];

    for (const test of testUrls) {
      try {
        const start = Date.now();
        await execAsync(`curl -s -o /dev/null -w "%{speed_download}" ${test.url}`);
        const duration = (Date.now() - start) / 1000;

        const speed = (test.size / duration) * 8; // Convert to Mbps

        results.push({
          server: test.name,
          downloadSpeed: speed.toFixed(2) + ' Mbps',
          duration: duration.toFixed(2) + 's',
          size: test.size + ' MB'
        });
      } catch (error) {
        results.push({
          server: test.name,
          error: 'Test failed'
        });
      }
    }

    res.json({
      results,
      timestamp: new Date(),
      note: 'This is a simplified speed test. Results may vary.'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Speed test failed',
      message: error.message
    });
  }
});

module.exports = router;
