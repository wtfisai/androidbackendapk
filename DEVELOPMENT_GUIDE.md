# Development Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Java 11+
- Android SDK (with ANDROID_HOME set)
- Firebase CLI
- Git

### Initial Setup

1. **Clone and setup**:
```bash
git clone <repo-url>
cd androidbackend-platform
./scripts/setup.sh  # or npm run setup on Windows
```

2. **Install dependencies**:
```bash
npm run install:all
```

3. **Firebase setup**:
```bash
cd firebase-backend
firebase login
firebase use --add  # Select your project
```

4. **Configure environment**:
```bash
# Copy example files
cp firebase-backend/functions/.env.example firebase-backend/functions/.env
cp android-app/app/google-services.json.example android-app/app/google-services.json

# Edit with your actual values
```

## 🏗️ Development Workflow

### Starting Development Servers

```bash
# Start all services
npm run dev

# Individual services
npm run dev:firebase    # Firebase emulators
npm run dev:web        # Web dashboard
npm run dev:android    # Android build
```

### Building Components

```bash
# Build everything
npm run build

# Individual builds
npm run build:firebase
npm run build:web
npm run build:android
```

### Testing

```bash
# Run all tests
npm test

# Individual test suites
npm run test:firebase
npm run test:web
npm run test:android
```

### Linting & Code Quality

```bash
# Lint all code
npm run lint

# Auto-fix issues
npm run lint:firebase -- --fix
npm run lint:web -- --fix
```

## 📱 Android Development

### Project Structure
```
android-app/
├── app/
│   ├── src/main/java/com/androiddiagnostic/
│   │   ├── services/          # Background services
│   │   ├── receivers/         # Broadcast receivers
│   │   ├── workers/           # WorkManager workers
│   │   ├── utils/            # Utility classes
│   │   └── models/           # Data models
│   ├── src/main/res/         # Resources
│   └── build.gradle          # App dependencies
├── build.gradle              # Project config
└── gradle.properties         # Gradle settings
```

### Key Components

#### Services
- **DeviceMonitorService**: Continuous device monitoring
- **CommandExecutorService**: Remote command execution
- **DataSyncService**: Firebase synchronization

#### Permissions
The app requires various permissions for full functionality:
- Network access for communication
- Location for device tracking
- Usage stats for app monitoring
- Accessibility for UI automation

### Building & Testing

```bash
cd android-app

# Debug build
./gradlew assembleDebug

# Release build  
./gradlew assembleRelease

# Run tests
./gradlew test

# Run on connected device
./gradlew installDebug
```

## 🔥 Firebase Backend Development

### Project Structure
```
firebase-backend/
├── functions/
│   ├── src/
│   │   ├── api/              # REST API routes
│   │   ├── services/         # Business logic
│   │   ├── models/          # Data models
│   │   ├── middleware/      # Express middleware
│   │   ├── utils/           # Helper functions
│   │   └── types/           # TypeScript types
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules          # Database security rules
├── firestore.indexes.json   # Database indexes
├── storage.rules           # Storage security rules
└── firebase.json           # Firebase configuration
```

### Local Development

```bash
cd firebase-backend

# Start emulators
firebase emulators:start

# Access emulator UI
# http://localhost:4000

# Deploy functions only
firebase deploy --only functions

# Deploy everything
firebase deploy
```

### Environment Variables

Create `functions/.env`:
```env
STRIPE_SECRET_KEY=sk_test_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
SENDGRID_API_KEY=SG...
JWT_SECRET=your_secret_here
```

### Adding New API Endpoints

1. Create route file in `src/api/`:
```typescript
// src/api/newFeature.ts
import { Router } from 'express';

export const newFeatureRouter = Router();

newFeatureRouter.get('/', async (req, res) => {
  // Implementation
});
```

2. Add to main index:
```typescript
// src/index.ts
import { newFeatureRouter } from './api/newFeature';
app.use('/new-feature', authMiddleware, newFeatureRouter);
```

## 🌐 Web Dashboard Development

### Project Structure (When Created)
```
web-dashboard/
├── src/
│   ├── components/          # React components
│   ├── pages/              # Page components
│   ├── services/           # API services
│   ├── hooks/              # Custom hooks
│   ├── context/            # React context
│   └── utils/              # Helper functions
├── public/                 # Static assets
└── package.json
```

### Development Commands
```bash
cd web-dashboard

# Start dev server
npm start

# Build for production
npm run build

# Run tests
npm test
```

## 🗃️ Database Management

### Firestore Collections

#### Users
```typescript
interface User {
  uid: string;
  email: string;
  displayName: string;
  subscription: {
    plan: 'free' | 'pro' | 'business' | 'enterprise';
    status: 'active' | 'canceled';
    deviceLimit: number;
  };
  settings: {
    notifications: boolean;
    alertRules: AlertRule[];
  };
}
```

#### Devices
```typescript
interface Device {
  deviceId: string;
  userId: string;
  name: string;
  model: string;
  androidVersion: string;
  status: 'online' | 'offline';
  metrics: DeviceMetrics;
  capabilities: DeviceCapabilities;
  lastSeen: Timestamp;
}
```

### Indexes
Important Firestore indexes are defined in `firestore.indexes.json`:
- Users by email
- Devices by userId + status
- Commands by deviceId + status
- Activities by userId + timestamp

## 🔐 Security Considerations

### Authentication
- Firebase Auth for user management
- JWT tokens for API access
- Device attestation for APK security

### Data Protection
- Firestore security rules
- End-to-end encryption for sensitive commands
- API rate limiting
- Input validation with Joi

### Permissions
- Principle of least privilege
- Runtime permission requests
- Graceful degradation for missing permissions

## 📊 Monitoring & Analytics

### Logging
- Firebase Functions logs
- Android Logcat integration
- Structured logging format

### Error Tracking
- Firebase Crashlytics (Android)
- Error reporting in Firebase Functions
- User feedback collection

### Performance
- Firebase Performance Monitoring
- Custom metrics collection
- Database query optimization

## 🚀 Deployment

### Staging Environment
- Automatic deployment on `develop` branch
- Firebase staging project
- APK signed with debug key

### Production Environment
- Manual approval required
- Firebase production project
- APK signed with release key
- Database backups before deployment

### CI/CD Pipeline
- GitHub Actions workflows
- Automated testing
- Security scanning
- Artifact generation

## 🔧 Troubleshooting

### Common Issues

#### Android Build Errors
```bash
# Clear Gradle cache
./gradlew clean

# Update dependencies
./gradlew --refresh-dependencies
```

#### Firebase Emulator Issues
```bash
# Clear emulator data
firebase emulators:exec --import=./seed-data "echo 'cleared'"

# Restart with fresh data
firebase emulators:start --import=./seed-data
```

#### Permission Issues
1. Check AndroidManifest.xml permissions
2. Verify runtime permission requests
3. Test on different Android versions

### Debug Commands
```bash
# View Firebase logs
firebase functions:log

# Android logs
adb logcat | grep AndroidDiagnostic

# Test API endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/devices
```

## 📚 Resources

### Documentation
- [Firebase Documentation](https://firebase.google.com/docs)
- [Android Developer Guide](https://developer.android.com)
- [React Documentation](https://reactjs.org/docs)

### Tools
- Android Studio for APK development
- VS Code with Firebase extension
- Firebase Console for backend management
- Chrome DevTools for web debugging

---

## Next Steps for Week 2

1. **Complete Android Services Implementation**
   - DeviceMonitorService with foreground notification
   - CommandExecutorService with WebSocket connection
   - DataSyncService with offline queue

2. **Firebase Functions Development**
   - Authentication endpoints
   - Device registration API
   - Command queue system

3. **Testing Infrastructure**
   - Unit tests for Android services
   - Integration tests for Firebase functions
   - End-to-end testing setup

4. **Documentation**
   - API documentation
   - Android SDK guide
   - Deployment procedures