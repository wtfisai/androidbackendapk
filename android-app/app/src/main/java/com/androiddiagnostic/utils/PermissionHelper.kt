package com.androiddiagnostic.utils

import android.Manifest
import android.app.Activity
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionHelper(private val context: Context) {
    
    companion object {
        // Request codes for different permission types
        const val REQUEST_CODE_BASIC_PERMISSIONS = 1001
        const val REQUEST_CODE_LOCATION_PERMISSIONS = 1002
        const val REQUEST_CODE_PHONE_PERMISSIONS = 1003
        const val REQUEST_CODE_STORAGE_PERMISSIONS = 1004
        
        // Special permission request codes
        const val REQUEST_CODE_USAGE_STATS = 2001
        const val REQUEST_CODE_BATTERY_OPTIMIZATION = 2002
        const val REQUEST_CODE_SYSTEM_ALERT_WINDOW = 2003
        const val REQUEST_CODE_ACCESSIBILITY_SERVICE = 2004
        const val REQUEST_CODE_DEVICE_ADMIN = 2005
    }
    
    // Basic runtime permissions
    private val basicPermissions = arrayOf(
        Manifest.permission.INTERNET,
        Manifest.permission.ACCESS_NETWORK_STATE,
        Manifest.permission.ACCESS_WIFI_STATE,
        Manifest.permission.RECEIVE_BOOT_COMPLETED,
        Manifest.permission.FOREGROUND_SERVICE
    )
    
    // Location permissions
    private val locationPermissions = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )
    
    // Phone state permissions
    private val phonePermissions = arrayOf(
        Manifest.permission.READ_PHONE_STATE
    )
    
    // Storage permissions
    private val storagePermissions = arrayOf(
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE
    )
    
    // Background location (Android 10+)
    private val backgroundLocationPermissions = arrayOf(
        Manifest.permission.ACCESS_BACKGROUND_LOCATION
    )
    
    /**
     * Get all required permissions for the app
     */
    fun getRequiredPermissions(): Array<String> {
        val allPermissions = mutableListOf<String>()
        allPermissions.addAll(basicPermissions)
        allPermissions.addAll(locationPermissions)
        allPermissions.addAll(phonePermissions)
        allPermissions.addAll(storagePermissions)
        
        // Add background location for Android 10+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            allPermissions.addAll(backgroundLocationPermissions)
        }
        
        return allPermissions.toTypedArray()
    }
    
    /**
     * Check if all required runtime permissions are granted
     */
    fun hasAllRequiredPermissions(): Boolean {
        return getRequiredPermissions().all { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Get list of missing permissions
     */
    fun getMissingPermissions(): List<String> {
        return getRequiredPermissions().filter { permission ->
            ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Request basic permissions
     */
    fun requestBasicPermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            basicPermissions,
            REQUEST_CODE_BASIC_PERMISSIONS
        )
    }
    
    /**
     * Request location permissions
     */
    fun requestLocationPermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            locationPermissions,
            REQUEST_CODE_LOCATION_PERMISSIONS
        )
    }
    
    /**
     * Request phone permissions
     */
    fun requestPhonePermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            phonePermissions,
            REQUEST_CODE_PHONE_PERMISSIONS
        )
    }
    
    /**
     * Request storage permissions
     */
    fun requestStoragePermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            storagePermissions,
            REQUEST_CODE_STORAGE_PERMISSIONS
        )
    }
    
    /**
     * Check if usage stats permission is granted
     */
    fun hasUsageStatsPermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        } else {
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
    
    /**
     * Request usage stats permission
     */
    fun requestUsageStatsPermission(activity: Activity) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        activity.startActivityForResult(intent, REQUEST_CODE_USAGE_STATS)
    }
    
    /**
     * Check if battery optimization is disabled
     */
    fun isBatteryOptimizationDisabled(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true // Not applicable for older versions
        }
    }
    
    /**
     * Request to disable battery optimization
     */
    fun requestDisableBatteryOptimization(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            activity.startActivityForResult(intent, REQUEST_CODE_BATTERY_OPTIMIZATION)
        }
    }
    
    /**
     * Check if system alert window permission is granted
     */
    fun hasSystemAlertWindowPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true // Not applicable for older versions
        }
    }
    
    /**
     * Request system alert window permission
     */
    fun requestSystemAlertWindowPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            activity.startActivityForResult(intent, REQUEST_CODE_SYSTEM_ALERT_WINDOW)
        }
    }
    
    /**
     * Check if accessibility service is enabled
     */
    fun isAccessibilityServiceEnabled(): Boolean {
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        
        val colonSplitter = enabledServices.split(":")
        for (service in colonSplitter) {
            if (service.contains(context.packageName)) {
                return true
            }
        }
        return false
    }
    
    /**
     * Request accessibility service permission
     */
    fun requestAccessibilityServicePermission(activity: Activity) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        activity.startActivityForResult(intent, REQUEST_CODE_ACCESSIBILITY_SERVICE)
    }
    
    /**
     * Check if notification listener service is enabled
     */
    fun isNotificationListenerEnabled(): Boolean {
        val enabledListeners = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        
        return enabledListeners.contains(context.packageName)
    }
    
    /**
     * Request notification listener permission
     */
    fun requestNotificationListenerPermission(activity: Activity) {
        val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        activity.startActivity(intent)
    }
    
    /**
     * Check if device admin is active
     */
    fun isDeviceAdminActive(): Boolean {
        val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val componentName = android.content.ComponentName(context, com.androiddiagnostic.receivers.DeviceAdminReceiver::class.java)
        return devicePolicyManager.isAdminActive(componentName)
    }
    
    /**
     * Request device admin permission
     */
    fun requestDeviceAdminPermission(activity: Activity) {
        val componentName = android.content.ComponentName(context, com.androiddiagnostic.receivers.DeviceAdminReceiver::class.java)
        val intent = Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName)
            putExtra(
                android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Enable device admin to allow advanced device management features"
            )
        }
        activity.startActivityForResult(intent, REQUEST_CODE_DEVICE_ADMIN)
    }
    
    /**
     * Get permission status summary
     */
    fun getPermissionStatus(): PermissionStatus {
        return PermissionStatus(
            basicPermissions = basicPermissions.all { 
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED 
            },
            locationPermissions = locationPermissions.all { 
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED 
            },
            phonePermissions = phonePermissions.all { 
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED 
            },
            storagePermissions = storagePermissions.all { 
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED 
            },
            usageStats = hasUsageStatsPermission(),
            batteryOptimization = isBatteryOptimizationDisabled(),
            systemAlertWindow = hasSystemAlertWindowPermission(),
            accessibilityService = isAccessibilityServiceEnabled(),
            notificationListener = isNotificationListenerEnabled(),
            deviceAdmin = isDeviceAdminActive()
        )
    }
    
    /**
     * Check if should show rationale for permission
     */
    fun shouldShowRationale(activity: Activity, permission: String): Boolean {
        return ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
    }
    
    /**
     * Get user-friendly description for permission
     */
    fun getPermissionDescription(permission: String): String {
        return when (permission) {
            Manifest.permission.ACCESS_FINE_LOCATION -> "Location access is needed to track device location and provide location-based features"
            Manifest.permission.ACCESS_COARSE_LOCATION -> "Location access is needed for network-based location services"
            Manifest.permission.READ_PHONE_STATE -> "Phone state access is needed to read device information and network status"
            Manifest.permission.READ_EXTERNAL_STORAGE -> "Storage access is needed to read log files and exported data"
            Manifest.permission.WRITE_EXTERNAL_STORAGE -> "Storage access is needed to save screenshots and export data"
            Manifest.permission.CAMERA -> "Camera access is needed for QR code scanning and remote assistance"
            Manifest.permission.RECORD_AUDIO -> "Microphone access is needed for voice commands and remote assistance"
            else -> "This permission is required for the app to function properly"
        }
    }
    
    data class PermissionStatus(
        val basicPermissions: Boolean,
        val locationPermissions: Boolean,
        val phonePermissions: Boolean,
        val storagePermissions: Boolean,
        val usageStats: Boolean,
        val batteryOptimization: Boolean,
        val systemAlertWindow: Boolean,
        val accessibilityService: Boolean,
        val notificationListener: Boolean,
        val deviceAdmin: Boolean
    ) {
        fun hasAllCriticalPermissions(): Boolean {
            return basicPermissions && usageStats && batteryOptimization
        }
        
        fun getCompletionPercentage(): Int {
            val total = 10
            val granted = listOf(
                basicPermissions, locationPermissions, phonePermissions, storagePermissions,
                usageStats, batteryOptimization, systemAlertWindow, accessibilityService,
                notificationListener, deviceAdmin
            ).count { it }
            return (granted * 100) / total
        }
    }
}