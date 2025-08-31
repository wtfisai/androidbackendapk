# Android Remote Diagnostic API 🚀

A comprehensive REST API server for remotely monitoring, debugging, and managing Android devices via Termux. Features a powerful web dashboard with 36+ integrated debugging tools.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Termux-orange)

## 🌟 Features

### Core Capabilities

- **System Monitoring** - Real-time CPU, memory, disk, and process monitoring
- **Device Management** - Battery status, network interfaces, device properties
- **Package Management** - List, install, uninstall Android packages
- **Remote Command Execution** - Secure shell and ADB command execution
- **Debug Tools Dashboard** - Web-based interface for all debugging features
- **Data Export** - Export logs, traces, and network packets to files

### 36 Integrated Android Debug Tools

#### 🔍 Debugging & Logs

1. **Logcat** - Real-time Android system logs with advanced filtering
2. **Bug Report Generator** - Comprehensive system diagnostic reports
3. **Layout Inspector** - UI hierarchy and view tree analysis
4. **Database Inspector** - SQLite/Room database exploration
5. **Network Inspector** - HTTP/WebSocket traffic monitoring

#### 📊 Performance Profiling

6. **CPU Profiler** - CPU usage sampling and tracing
7. **Memory Profiler** - Memory allocations and heap analysis
8. **Power Profiler** - Battery usage and power consumption
9. **System Trace** - Full system tracing via Perfetto
10. **Battery Stats** - Detailed battery consumption analytics

#### 🔧 System Tools

11. **Dumpsys Services** - Inspect 30+ system services
12. **Settings Manager** - Read/write system settings
13. **Developer Options** - Toggle developer settings
14. **Permission Manager** - Grant/revoke app permissions
15. **Screen Recording** - Capture screen activity

#### 📱 Device Management

16. **ADB Device Discovery** - List and manage connected devices
17. **Wireless Debugging** - Connect via Wi-Fi
18. **App Installation** - Install/uninstall APKs
19. **Port Forwarding** - Bridge local/device ports
20. **Intent Broadcasting** - Send system intents

#### 🧪 Testing Frameworks

21. **UI Automator** - Cross-app UI automation
22. **Monkey Testing** - Random UI stress testing
23. **Instrumented Tests** - Run JUnit tests on device
24. **Espresso Integration** - UI testing framework
25. **Screenshot Capture** - Take device screenshots

#### 🌐 Network Analysis

26. **Network Connections** - Active connection monitoring
27. **Packet Capture** - tcpdump integration
28. **Port Scanning** - Network service discovery
29. **Bandwidth Monitoring** - Network usage statistics
30. **WiFi Scanner** - Available networks detection

#### 📈 Advanced Diagnostics

31. **Process Optimization** - Sleep/wake/kill processes
32. **Memory Cleanup** - Free system memory
33. **Trace Logging** - Application trace collection
34. **GDB Debugging** - Native code debugging
35. **Heap Dumps** - Memory heap analysis
36. **Export All Data** - Comprehensive data export with customizable options

## Quick Start

### Installation

1. Install Termux from F-Droid
2. Clone this repository:

```bash
git clone https://github.com/yourusername/androidbackend.git
cd androidbackend
```

3. Run the installer:

```bash
chmod +x install.sh
./install.sh
```

4. Start the server:

```bash
npm start
```

### Access the Dashboard

- **Local (on Android):** http://localhost:3000
- **Remote (from network):** http://YOUR_DEVICE_IP:3000

Default API Key: `diagnostic-api-key-2024`

## API Endpoints

### Public Endpoints

- `GET /health` - Server health check
- `GET /api/info` - API information and key

### Authenticated Endpoints

All authenticated endpoints require `x-api-key` header.

- `GET /api/system` - System information
- `GET /api/device/properties` - Device properties
- `GET /api/device/battery` - Battery status
- `GET /api/device/network` - Network interfaces
- `GET /api/processes` - Running processes
- `GET /api/packages` - Installed packages
- `GET /api/storage` - Storage information
- `GET /api/logcat` - System logs
- `POST /api/shell` - Execute shell commands
- `POST /api/adb/execute` - Execute ADB commands

## Windows Client

Use the included PowerShell client for Windows:

```powershell
.\windows-client.ps1 -ServerUrl "http://DEVICE_IP:3000" -ApiKey "diagnostic-api-key-2024"
```

## Auto-Start Setup

### Method 1: Termux:Boot

1. Install Termux:Boot from F-Droid
2. Grant startup permission in Android settings
3. Server starts automatically on boot

### Method 2: Termux Services

```bash
sv-enable diagnostic-api
```

## Security

- API key authentication required for sensitive endpoints
- Command whitelisting for ADB operations
- Rate limiting (100 requests/minute per IP)
- Dangerous shell commands blocked

## Technologies

- Node.js & Express.js
- Bootstrap 5 (Web UI)
- Termux environment
- Android Debug Bridge (ADB)

## Docker Deployment

### Quick Start with Docker

```bash
# Build the image
docker build -t android-diagnostic-api .

# Run the container
docker run -d -p 3000:3000 --name android-api android-diagnostic-api

# Or use docker-compose
docker-compose up -d
```

### Docker Compose Setup

The project includes several Docker Compose configurations:

- `docker-compose.yml` - Production setup with Nginx and Redis
- `docker-compose.dev.yml` - Development setup with hot reload

```bash
# Production deployment
docker-compose up -d

# Development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment Variables for Docker

Create a `.env` file for Docker deployment:

```env
API_KEY=your-secure-api-key
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:3000,http://your-domain.com
```

### Docker Hub

Pull the pre-built image (when available):

```bash
docker pull yourusername/android-diagnostic-api:latest
```

### Kubernetes Deployment

For Kubernetes deployment, use the included manifests:

```bash
kubectl apply -f k8s/
```

## Requirements

### For Termux Installation

- Android device with Termux
- Node.js 18+
- Network connection

### For Docker

- Docker Engine 20.10+
- Docker Compose 2.0+ (optional)
- 512MB RAM minimum
- 100MB disk space

## License

MIT

## Contributing

Pull requests are welcome! Please read the contributing guidelines first.

## Support

For issues or questions, please open an issue on GitHub.
