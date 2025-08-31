# Android Diagnostic Platform

A comprehensive Android device monitoring and management platform consisting of a native Android APK and centralized Firebase backend.

## 🏗️ Architecture Overview

```
androidbackend-platform/
├── android-app/          # Native Android APK
├── firebase-backend/     # Centralized backend services
├── web-dashboard/        # React-based web interface
├── shared/              # Shared utilities and types
├── docs/                # Documentation
├── scripts/             # Build and deployment scripts
└── legacy/              # Original Node.js implementation
```

## 📱 Project Components

### Android App
- **Path**: `android-app/`
- **Tech**: Java/Kotlin, Android SDK
- **Purpose**: Native device agent for monitoring and command execution

### Firebase Backend  
- **Path**: `firebase-backend/`
- **Tech**: Firebase Functions, Firestore, Auth
- **Purpose**: Centralized API, user management, device orchestration

### Web Dashboard
- **Path**: `web-dashboard/`
- **Tech**: React, TypeScript
- **Purpose**: Multi-device management interface

### Legacy Implementation
- **Path**: `legacy/`
- **Tech**: Node.js, Express, NeDB
- **Purpose**: Original Termux-based implementation (deprecated)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Java 11+ 
- Android SDK
- Firebase CLI
- Docker (optional)

### Development Setup

1. **Clone and setup**:
```bash
git clone <repo-url>
cd androidbackend-platform
npm install
```

2. **Firebase setup**:
```bash
cd firebase-backend
firebase login
firebase use --add  # Select your Firebase project
npm install
```

3. **Android setup**:
```bash
cd android-app
./gradlew build
```

4. **Web dashboard setup**:
```bash
cd web-dashboard  
npm install
npm start
```

## 📋 Development Status

| Component | Status | Progress |
|-----------|--------|----------|
| Repository Structure | ✅ Complete | 100% |
| Android App | 🚧 In Development | 0% |
| Firebase Backend | 🚧 Planned | 0% |
| Web Dashboard | 🚧 Planned | 0% |
| Legacy Migration | 🚧 In Progress | 10% |

## 📖 Documentation

- [Migration Plan](APK_MIGRATION_PLAN.md) - Complete migration strategy
- [Technical Specifications](APK_TECHNICAL_SPEC.md) - Android implementation details
- [Backend Architecture](FIREBASE_BACKEND_SPEC.md) - Firebase backend design
- [Additional Considerations](ADDITIONAL_CONSIDERATIONS.md) - Challenges and features

## 🔄 Migration Progress

**Current Phase**: Foundation Setup (Week 1/14)
- [x] Repository restructure
- [ ] Android project initialization
- [ ] Firebase project setup
- [ ] CI/CD pipeline
- [ ] Development environment

## 📊 Features

### Current (Legacy)
- 36+ Android debugging tools
- System monitoring
- Command execution
- Local web dashboard
- API key authentication

### Planned (APK + Backend)
- Native Android integration
- Multi-device management
- User authentication system
- Push notifications
- Subscription tiers
- Cross-device automation
- AI-powered insights
- Enterprise features

## 🛠️ Available Commands

```bash
# Development
npm run dev              # Start all services in dev mode
npm run build           # Build all components  
npm run test            # Run test suites
npm run lint            # Lint all code

# Legacy (deprecated)
npm start               # Start legacy Node.js server
npm run legacy:test     # Test legacy implementation
```

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

**⚠️ Note**: This project is currently undergoing migration from Node.js/Termux to native Android APK + Firebase backend. The legacy implementation in `/legacy` is deprecated and will be removed after successful migration.