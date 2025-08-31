#!/bin/bash
# Setup script for Android Diagnostic Platform

set -e

echo "🚀 Setting up Android Diagnostic Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js version must be 18 or higher. Current version: $(node --version)${NC}"
    exit 1
fi

# Check Java
if ! command -v java &> /dev/null; then
    echo -e "${RED}Java is not installed. Please install Java 11+ for Android development.${NC}"
    exit 1
fi

# Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}Firebase CLI not found. Installing...${NC}"
    npm install -g firebase-tools
fi

# Check Android SDK (optional warning)
if [ ! -d "$ANDROID_HOME" ] && [ ! -d "$ANDROID_SDK_ROOT" ]; then
    echo -e "${YELLOW}Warning: Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT for Android development.${NC}"
fi

echo -e "${GREEN}✓ Prerequisites check complete${NC}"

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"

# Root dependencies
npm install

# Firebase backend dependencies
echo -e "${YELLOW}Installing Firebase backend dependencies...${NC}"
cd firebase-backend/functions
npm install
cd ../..

# Web dashboard dependencies (when created)
if [ -d "web-dashboard" ]; then
    echo -e "${YELLOW}Installing web dashboard dependencies...${NC}"
    cd web-dashboard
    npm install
    cd ..
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Firebase setup
echo -e "${YELLOW}Setting up Firebase...${NC}"

if [ ! -f "firebase-backend/.firebaserc" ]; then
    echo -e "${YELLOW}Firebase project not configured. Run 'firebase login' and 'firebase use --add' in firebase-backend/ directory${NC}"
else
    echo -e "${GREEN}✓ Firebase project already configured${NC}"
fi

# Android setup
echo -e "${YELLOW}Setting up Android project...${NC}"

if [ -f "android-app/gradlew" ]; then
    cd android-app
    chmod +x gradlew
    ./gradlew build
    cd ..
    echo -e "${GREEN}✓ Android project built successfully${NC}"
else
    echo -e "${YELLOW}Android gradlew not found. Android setup may be incomplete.${NC}"
fi

# Git hooks setup
if [ -d ".git" ]; then
    echo -e "${YELLOW}Setting up Git hooks...${NC}"
    npx husky install
    echo -e "${GREEN}✓ Git hooks configured${NC}"
fi

# Create environment files
echo -e "${YELLOW}Creating environment configuration files...${NC}"

# Firebase backend environment
if [ ! -f "firebase-backend/functions/.env.example" ]; then
    cat > firebase-backend/functions/.env.example << EOF
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id

# External Services
STRIPE_SECRET_KEY=sk_test_your_stripe_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
SENDGRID_API_KEY=your_sendgrid_key

# JWT Secret
JWT_SECRET=your_jwt_secret_key_here

# Redis (if using external Redis)
REDIS_URL=redis://localhost:6379
EOF
    echo -e "${GREEN}✓ Created firebase-backend/functions/.env.example${NC}"
fi

# Android app configuration
if [ ! -f "android-app/app/google-services.json.example" ]; then
    cat > android-app/app/google-services.json.example << EOF
{
  "project_info": {
    "project_number": "your_project_number",
    "project_id": "your-project-id"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "your_app_id",
        "android_client_info": {
          "package_name": "com.androiddiagnostic.agent"
        }
      },
      "api_key": [
        {
          "current_key": "your_android_api_key"
        }
      ]
    }
  ]
}
EOF
    echo -e "${GREEN}✓ Created android-app/app/google-services.json.example${NC}"
fi

echo -e "${GREEN}🎉 Setup complete!${NC}"
echo -e "${YELLOW}"
echo "Next steps:"
echo "1. Configure Firebase:"
echo "   cd firebase-backend"
echo "   firebase login"
echo "   firebase use --add"
echo ""
echo "2. Copy and configure environment files:"
echo "   cp firebase-backend/functions/.env.example firebase-backend/functions/.env"
echo "   cp android-app/app/google-services.json.example android-app/app/google-services.json"
echo ""
echo "3. Start development servers:"
echo "   npm run dev"
echo ""
echo "4. Build Android APK:"
echo "   npm run build:android"
echo -e "${NC}"