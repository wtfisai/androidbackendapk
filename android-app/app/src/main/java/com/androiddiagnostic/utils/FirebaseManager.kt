package com.androiddiagnostic.utils

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.androiddiagnostic.models.*
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.tasks.await
import java.io.File
import java.util.UUID

class FirebaseManager {
    
    companion object {
        private const val TAG = "FirebaseManager"
        private var deviceId: String? = null
    }
    
    private val auth = FirebaseAuth.getInstance()
    private val firestore = FirebaseFirestore.getInstance()
    private val functions = FirebaseFunctions.getInstance()
    private val storage = FirebaseStorage.getInstance()
    private val messaging = FirebaseMessaging.getInstance()
    
    fun getCurrentUser(): FirebaseUser? = auth.currentUser
    
    fun getFirestore(): FirebaseFirestore = firestore
    
    fun getDeviceId(): String {
        if (deviceId == null) {
            deviceId = generateDeviceId()
        }
        return deviceId!!
    }
    
    private fun generateDeviceId(): String {
        // Use Android ID if available, otherwise generate UUID
        val androidId = try {
            Settings.Secure.getString(
                DiagnosticApplication.instance.contentResolver,
                Settings.Secure.ANDROID_ID
            )
        } catch (e: Exception) {
            null
        }
        
        return androidId ?: UUID.randomUUID().toString()
    }
    
    suspend fun registerDevice(): DeviceInfo {
        val user = getCurrentUser() ?: throw IllegalStateException("User not authenticated")
        val deviceId = getDeviceId()
        
        val deviceInfo = DeviceInfo(
            deviceId = deviceId,
            userId = user.uid,
            name = "${Build.MANUFACTURER} ${Build.MODEL}",
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            androidVersion = Build.VERSION.RELEASE,
            apiLevel = Build.VERSION.SDK_INT,
            serialNumber = Build.SERIAL,
            imei = "", // Requires permission
            status = "online",
            capabilities = detectCapabilities(),
            registeredAt = System.currentTimeMillis(),
            lastSeen = System.currentTimeMillis()
        )
        
        // Save to Firestore
        firestore.collection("devices")
            .document(deviceId)
            .set(deviceInfo, SetOptions.merge())
            .await()
        
        // Get FCM token for push notifications
        try {
            val fcmToken = messaging.token.await()
            updateDeviceFCMToken(fcmToken)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get FCM token", e)
        }
        
        return deviceInfo
    }
    
    private fun detectCapabilities(): DeviceCapabilities {
        val context = DiagnosticApplication.instance
        return DeviceCapabilities(
            root = checkRootAccess(),
            adb = checkADBAccess(),
            accessibility = checkAccessibilityService(context),
            deviceAdmin = checkDeviceAdmin(context),
            systemApps = checkSystemApps(),
            usageStats = checkUsageStatsPermission(context),
            notifications = checkNotificationAccess(context),
            location = checkLocationPermission(context)
        )
    }
    
    private fun checkRootAccess(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("su")
            process.destroy()
            true
        } catch (e: Exception) {
            false
        }
    }
    
    private fun checkADBAccess(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("which adb")
            val exitCode = process.waitFor()
            exitCode == 0
        } catch (e: Exception) {
            false
        }
    }
    
    private fun checkAccessibilityService(context: Context): Boolean {
        // Check if accessibility service is enabled
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(context.packageName) == true
    }
    
    private fun checkDeviceAdmin(context: Context): Boolean {
        // Check if app has device admin privileges
        val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val componentName = android.content.ComponentName(context, DeviceAdminReceiver::class.java)
        return devicePolicyManager.isAdminActive(componentName)
    }
    
    private fun checkSystemApps(): Boolean {
        // Check if app is installed as system app
        return try {
            val appInfo = DiagnosticApplication.instance.packageManager
                .getApplicationInfo(DiagnosticApplication.instance.packageName, 0)
            (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
        } catch (e: Exception) {
            false
        }
    }
    
    private fun checkUsageStatsPermission(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        } else {
            appOps.checkOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        }
        return mode == android.app.AppOpsManager.MODE_ALLOWED
    }
    
    private fun checkNotificationAccess(context: Context): Boolean {
        val enabledListeners = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        )
        return enabledListeners?.contains(context.packageName) == true
    }
    
    private fun checkLocationPermission(context: Context): Boolean {
        return context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == 
               android.content.pm.PackageManager.PERMISSION_GRANTED
    }
    
    suspend fun updateDeviceFCMToken(token: String) {
        val deviceId = getDeviceId()
        firestore.collection("devices")
            .document(deviceId)
            .update("fcmToken", token)
            .await()
    }
    
    suspend fun syncDeviceMetrics(metrics: DeviceMetrics) {
        val deviceId = getDeviceId()
        val user = getCurrentUser() ?: return
        
        // Update device document with latest metrics
        val metricsMap = mapOf(
            "metrics" to metrics,
            "lastSeen" to System.currentTimeMillis(),
            "status" to "online"
        )
        
        firestore.collection("devices")
            .document(deviceId)
            .set(metricsMap, SetOptions.merge())
            .await()
        
        // Add to metrics history collection
        val metricsDoc = hashMapOf(
            "deviceId" to deviceId,
            "userId" to user.uid,
            "timestamp" to System.currentTimeMillis(),
            "cpuUsage" to metrics.cpuUsage,
            "memoryInfo" to metrics.memoryInfo,
            "batteryInfo" to metrics.batteryInfo,
            "storageInfo" to metrics.storageInfo,
            "networkInfo" to metrics.networkInfo,
            "deviceTemperature" to metrics.deviceTemperature
        )
        
        firestore.collection("device_metrics")
            .add(metricsDoc)
            .await()
    }
    
    suspend fun updateCommandStatus(
        commandId: String,
        status: String,
        result: String? = null,
        error: String? = null,
        startedAt: Long? = null,
        completedAt: Long? = null
    ) {
        val updates = mutableMapOf<String, Any>(
            "status" to status,
            "updatedAt" to System.currentTimeMillis()
        )
        
        result?.let { updates["result"] = it }
        error?.let { updates["error"] = it }
        startedAt?.let { updates["startedAt"] = it }
        completedAt?.let { updates["completedAt"] = it }
        
        firestore.collection("commands")
            .document(commandId)
            .update(updates)
            .await()
    }
    
    suspend fun uploadFile(filePath: String, folder: String): String {
        val file = File(filePath)
        if (!file.exists()) {
            throw IllegalArgumentException("File does not exist: $filePath")
        }
        
        val deviceId = getDeviceId()
        val fileName = file.name
        val storageRef = storage.reference
            .child("devices/$deviceId/$folder/$fileName")
        
        val uploadTask = storageRef.putFile(android.net.Uri.fromFile(file))
        uploadTask.await()
        
        return storageRef.downloadUrl.await().toString()
    }
    
    suspend fun uploadText(text: String, fileName: String, folder: String): String {
        val deviceId = getDeviceId()
        val storageRef = storage.reference
            .child("devices/$deviceId/$folder/$fileName")
        
        val uploadTask = storageRef.putBytes(text.toByteArray())
        uploadTask.await()
        
        return storageRef.downloadUrl.await().toString()
    }
    
    suspend fun createAlert(alert: Alert) {
        val user = getCurrentUser() ?: return
        
        val alertDoc = hashMapOf(
            "alertId" to alert.id,
            "userId" to user.uid,
            "deviceId" to alert.deviceId,
            "type" to alert.type,
            "severity" to alert.severity,
            "title" to alert.title,
            "message" to alert.message,
            "value" to alert.value,
            "threshold" to alert.threshold,
            "timestamp" to alert.timestamp,
            "acknowledged" to alert.acknowledged
        )
        
        firestore.collection("alerts")
            .add(alertDoc)
            .await()
    }
    
    suspend fun getUserSettings(): UserSettings? {
        val user = getCurrentUser() ?: return null
        
        return try {
            val doc = firestore.collection("users")
                .document(user.uid)
                .get()
                .await()
            
            doc.toObject(User::class.java)?.settings
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get user settings", e)
            null
        }
    }
    
    suspend fun updateUserSettings(settings: UserSettings) {
        val user = getCurrentUser() ?: return
        
        firestore.collection("users")
            .document(user.uid)
            .update("settings", settings)
            .await()
    }
    
    suspend fun logActivity(
        type: String,
        action: String,
        details: Map<String, Any> = emptyMap()
    ) {
        val user = getCurrentUser()
        val deviceId = getDeviceId()
        
        val activity = hashMapOf(
            "userId" to (user?.uid ?: "anonymous"),
            "deviceId" to deviceId,
            "type" to type,
            "action" to action,
            "details" to details,
            "timestamp" to System.currentTimeMillis()
        )
        
        firestore.collection("activities")
            .add(activity)
            .await()
    }
}

// Placeholder for DeviceAdminReceiver (would need separate implementation)
class DeviceAdminReceiver : android.app.admin.DeviceAdminReceiver() {
    // Implementation would go here
}