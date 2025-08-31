const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const admin = require('firebase-admin');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Initialize test environment
let app;
let db;
let auth;

beforeAll(async () => {
  // Initialize Firebase Admin for testing
  app = initializeApp({
    projectId: 'test-project',
  });
  db = getFirestore(app);
  auth = getAuth(app);

  // Set up emulator settings
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
});

afterAll(async () => {
  // Clean up
  await app.delete();
});

describe('Device Management', () => {
  let testUserId;
  let testDeviceId;

  beforeAll(async () => {
    // Create test user
    const userRecord = await auth.createUser({
      email: 'test@example.com',
      password: 'testPassword123',
    });
    testUserId = userRecord.uid;
    testDeviceId = 'test-device-001';
  });

  it('should register a new device', async () => {
    const deviceData = {
      userId: testUserId,
      name: 'Test Device',
      model: 'Pixel 5',
      manufacturer: 'Google',
      androidVersion: '12',
      appVersion: '1.0.0',
      capabilities: {
        root: false,
        adb: true,
        accessibility: true,
      },
      status: 'online',
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('devices').doc(testDeviceId).set(deviceData);

    const doc = await db.collection('devices').doc(testDeviceId).get();
    expect(doc.exists).toBe(true);
    expect(doc.data().name).toBe('Test Device');
    expect(doc.data().userId).toBe(testUserId);
  });

  it('should update device metrics', async () => {
    const metrics = {
      deviceId: testDeviceId,
      userId: testUserId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      cpu: {
        usage: 45.5,
        cores: 8,
        frequency: 2400,
      },
      memory: {
        total: 8192,
        used: 4096,
        free: 4096,
        percentage: 50,
      },
      battery: {
        level: 75,
        charging: false,
        temperature: 32,
      },
      storage: {
        total: 128000,
        used: 64000,
        free: 64000,
        percentage: 50,
      },
      network: {
        type: 'wifi',
        connected: true,
        ip: '192.168.1.100',
      },
    };

    const metricsRef = await db.collection('device_metrics').add(metrics);

    const doc = await metricsRef.get();
    expect(doc.exists).toBe(true);
    expect(doc.data().cpu.usage).toBe(45.5);
    expect(doc.data().memory.percentage).toBe(50);
  });

  it('should retrieve user devices', async () => {
    const snapshot = await db.collection('devices')
      .where('userId', '==', testUserId)
      .get();

    expect(snapshot.empty).toBe(false);
    expect(snapshot.size).toBeGreaterThan(0);

    const device = snapshot.docs[0].data();
    expect(device.userId).toBe(testUserId);
  });

  it('should update device status', async () => {
    await db.collection('devices').doc(testDeviceId).update({
      status: 'offline',
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await db.collection('devices').doc(testDeviceId).get();
    expect(doc.data().status).toBe('offline');
  });
});

describe('Command Queue', () => {
  let testUserId;
  let testDeviceId;
  let testCommandId;

  beforeAll(async () => {
    testUserId = 'test-user-cmd';
    testDeviceId = 'test-device-cmd';
    testCommandId = 'test-command-001';
  });

  it('should create a new command', async () => {
    const command = {
      userId: testUserId,
      deviceId: testDeviceId,
      type: 'shell',
      command: 'ls -la',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      priority: 'normal',
    };

    await db.collection('commands').doc(testCommandId).set(command);

    const doc = await db.collection('commands').doc(testCommandId).get();
    expect(doc.exists).toBe(true);
    expect(doc.data().command).toBe('ls -la');
    expect(doc.data().status).toBe('pending');
  });

  it('should update command status', async () => {
    await db.collection('commands').doc(testCommandId).update({
      status: 'executing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await db.collection('commands').doc(testCommandId).get();
    expect(doc.data().status).toBe('executing');
  });

  it('should complete command with result', async () => {
    const result = {
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      result: 'Command executed successfully',
      output: 'total 24\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .',
      exitCode: 0,
    };

    await db.collection('commands').doc(testCommandId).update(result);

    const doc = await db.collection('commands').doc(testCommandId).get();
    expect(doc.data().status).toBe('completed');
    expect(doc.data().exitCode).toBe(0);
  });

  it('should handle command failure', async () => {
    const failedCommand = {
      userId: testUserId,
      deviceId: testDeviceId,
      type: 'shell',
      command: 'invalid_command',
      status: 'failed',
      error: 'Command not found',
      exitCode: 127,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('commands').add(failedCommand);
    const doc = await ref.get();

    expect(doc.data().status).toBe('failed');
    expect(doc.data().exitCode).toBe(127);
  });
});

describe('Alert System', () => {
  let testUserId;
  let testDeviceId;

  beforeAll(async () => {
    testUserId = 'test-user-alert';
    testDeviceId = 'test-device-alert';
  });

  it('should create CPU alert', async () => {
    const alert = {
      userId: testUserId,
      deviceId: testDeviceId,
      type: 'cpu',
      severity: 'high',
      message: 'CPU usage exceeded 90%',
      status: 'active',
      value: 92.5,
      threshold: 90,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('alerts').add(alert);
    const doc = await ref.get();

    expect(doc.exists).toBe(true);
    expect(doc.data().type).toBe('cpu');
    expect(doc.data().severity).toBe('high');
    expect(doc.data().value).toBeGreaterThan(doc.data().threshold);
  });

  it('should acknowledge alert', async () => {
    const alert = {
      userId: testUserId,
      deviceId: testDeviceId,
      type: 'memory',
      severity: 'medium',
      message: 'Memory usage at 85%',
      status: 'active',
      value: 85,
      threshold: 80,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('alerts').add(alert);

    await ref.update({
      status: 'acknowledged',
      acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await ref.get();
    expect(doc.data().status).toBe('acknowledged');
  });

  it('should auto-resolve alert', async () => {
    const alert = {
      userId: testUserId,
      deviceId: testDeviceId,
      type: 'battery',
      severity: 'low',
      message: 'Battery level low at 15%',
      status: 'active',
      value: 15,
      threshold: 20,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('alerts').add(alert);

    // Simulate auto-resolution when battery is charged
    await ref.update({
      status: 'resolved',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      autoResolved: true,
      resolvedValue: 85,
    });

    const doc = await ref.get();
    expect(doc.data().status).toBe('resolved');
    expect(doc.data().autoResolved).toBe(true);
    expect(doc.data().resolvedValue).toBeGreaterThan(doc.data().threshold);
  });
});
