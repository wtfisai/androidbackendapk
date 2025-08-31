import { Router } from 'express';
import * as admin from 'firebase-admin';
import { body, validationResult } from 'express-validator';

export const authRouter = Router();

// Register new user
authRouter.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('displayName').optional().trim().isLength({ min: 1, max: 50 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { email, password, displayName } = req.body;

      // Create user account
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: displayName || email.split('@')[0],
      });

      // Create user document in Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        subscription: {
          plan: 'free',
          status: 'active',
          deviceLimit: 1,
          features: ['basic_monitoring'],
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        settings: {
          notifications: true,
          emailNotifications: false,
          smsNotifications: false,
          alertRules: [],
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Generate custom token
      const customToken = await admin.auth().createCustomToken(userRecord.uid);

      res.json({
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
        },
        token: customToken,
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Registration failed',
      });
    }
  },
);

// Verify token and get user info
authRouter.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Get user document from Firestore
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        ...userDoc.data(),
      },
    });
  } catch (error: any) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
});

// Update user profile
authRouter.put('/profile',
  [
    body('displayName').optional().trim().isLength({ min: 1, max: 50 }),
    body('phoneNumber').optional().isMobilePhone('any'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const userId = (req as any).user.uid;
      const updates: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (req.body.displayName) {
        updates.displayName = req.body.displayName;
        // Also update in Auth
        await admin.auth().updateUser(userId, {
          displayName: req.body.displayName,
        });
      }

      if (req.body.phoneNumber) {
        updates.phoneNumber = req.body.phoneNumber;
      }

      await admin.firestore()
        .collection('users')
        .doc(userId)
        .update(updates);

      res.json({
        success: true,
        message: 'Profile updated successfully',
      });
    } catch (error: any) {
      console.error('Profile update error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Profile update failed',
      });
    }
  },
);

// Change password
authRouter.post('/change-password',
  [
    body('currentPassword').isLength({ min: 6 }),
    body('newPassword').isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const userId = (req as any).user.uid;
      const { newPassword } = req.body;

      await admin.auth().updateUser(userId, {
        password: newPassword,
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error: any) {
      console.error('Password change error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Password change failed',
      });
    }
  },
);

// Request password reset
authRouter.post('/reset-password',
  [
    body('email').isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { email } = req.body;

      // Generate password reset link
      const resetLink = await admin.auth().generatePasswordResetLink(email);

      // In production, send this via email
      console.log('Password reset link:', resetLink);

      res.json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Password reset failed',
      });
    }
  },
);

// Delete account
authRouter.delete('/account', async (req, res) => {
  try {
    const userId = (req as any).user.uid;

    // Delete user devices
    const devicesSnapshot = await admin.firestore()
      .collection('devices')
      .where('userId', '==', userId)
      .get();

    const batch = admin.firestore().batch();

    // Delete all user devices
    devicesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete user activities
    const activitiesSnapshot = await admin.firestore()
      .collection('activities')
      .where('userId', '==', userId)
      .get();

    activitiesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete user alerts
    const alertsSnapshot = await admin.firestore()
      .collection('alerts')
      .where('userId', '==', userId)
      .get();

    alertsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete user document
    batch.delete(admin.firestore().collection('users').doc(userId));

    await batch.commit();

    // Delete from Auth
    await admin.auth().deleteUser(userId);

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error: any) {
    console.error('Account deletion error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Account deletion failed',
    });
  }
});

// Get user subscription info
authRouter.get('/subscription', async (req, res) => {
  try {
    const userId = (req as any).user.uid;

    const userDoc = await admin.firestore()
      .collection('users')
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const userData = userDoc.data();
    const subscription = userData?.subscription;

    // Get device count
    const devicesSnapshot = await admin.firestore()
      .collection('devices')
      .where('userId', '==', userId)
      .get();

    const deviceCount = devicesSnapshot.size;

    res.json({
      success: true,
      subscription: {
        ...subscription,
        currentDeviceCount: deviceCount,
        usage: {
          devices: `${deviceCount}/${subscription?.deviceLimit || 1}`,
          percentageUsed: Math.round((deviceCount / (subscription?.deviceLimit || 1)) * 100),
        },
      },
    });
  } catch (error: any) {
    console.error('Subscription info error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get subscription info',
    });
  }
});
