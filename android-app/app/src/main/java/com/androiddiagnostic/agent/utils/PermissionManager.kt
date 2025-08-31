package com.androiddiagnostic.agent.utils

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager

class PermissionManager {
    
    companion object {
        
        fun hasUsageStatsPermission(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
                val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    appOps.unsafeCheckOpNoThrow(
                        AppOpsManager.OPSTR_GET_USAGE_STATS,
                        android.os.Process.myUid(),
                        context.packageName
                    )
                } else {
                    @Suppress("DEPRECATION")
                    appOps.checkOpNoThrow(
                        AppOpsManager.OPSTR_GET_USAGE_STATS,
                        android.os.Process.myUid(),
                        context.packageName
                    )
                }
                mode == AppOpsManager.MODE_ALLOWED
            } else {
                false
            }
        }
        
        fun isAccessibilityServiceEnabled(context: Context): Boolean {
            val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            
            for (service in enabledServices) {
                if (service.resolveInfo.serviceInfo.packageName == context.packageName) {
                    return true
                }
            }
            return false
        }
        
        fun isDeviceAdminActive(context: Context): Boolean {
            val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val componentName = ComponentName(context, DeviceAdminReceiver::class.java)
            return devicePolicyManager.isAdminActive(componentName)
        }
        
        fun hasOverlayPermission(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }
        
        fun hasNotificationListenerPermission(context: Context): Boolean {
            val enabledListeners = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            )
            return enabledListeners?.contains(context.packageName) == true
        }
        
        fun hasWriteSettingsPermission(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.System.canWrite(context)
            } else {
                true
            }
        }
        
        fun hasInstallPackagesPermission(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.packageManager.canRequestPackageInstalls()
            } else {
                true
            }
        }
        
        fun getAdminComponentName(context: Context): ComponentName {
            return ComponentName(context, DeviceAdminReceiver::class.java)
        }
        
        fun checkAllPermissions(context: Context): Map<String, Boolean> {
            val permissions = mutableMapOf<String, Boolean>()
            
            // Standard permissions
            permissions["INTERNET"] = hasPermission(context, android.Manifest.permission.INTERNET)
            permissions["ACCESS_NETWORK_STATE"] = hasPermission(context, android.Manifest.permission.ACCESS_NETWORK_STATE)
            permissions["ACCESS_WIFI_STATE"] = hasPermission(context, android.Manifest.permission.ACCESS_WIFI_STATE)
            permissions["ACCESS_FINE_LOCATION"] = hasPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION)
            permissions["ACCESS_COARSE_LOCATION"] = hasPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION)
            permissions["READ_PHONE_STATE"] = hasPermission(context, android.Manifest.permission.READ_PHONE_STATE)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions["POST_NOTIFICATIONS"] = hasPermission(context, android.Manifest.permission.POST_NOTIFICATIONS)
            }
            
            // Special permissions
            permissions["USAGE_STATS"] = hasUsageStatsPermission(context)
            permissions["ACCESSIBILITY"] = isAccessibilityServiceEnabled(context)
            permissions["DEVICE_ADMIN"] = isDeviceAdminActive(context)
            permissions["OVERLAY"] = hasOverlayPermission(context)
            permissions["NOTIFICATION_LISTENER"] = hasNotificationListenerPermission(context)
            permissions["WRITE_SETTINGS"] = hasWriteSettingsPermission(context)
            permissions["INSTALL_PACKAGES"] = hasInstallPackagesPermission(context)
            
            return permissions
        }
        
        private fun hasPermission(context: Context, permission: String): Boolean {
            return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
        }
    }
}

class DeviceAdminReceiver : android.app.admin.DeviceAdminReceiver() {
    
    override fun onEnabled(context: Context, intent: android.content.Intent) {
        super.onEnabled(context, intent)
        // Device admin enabled
    }
    
    override fun onDisabled(context: Context, intent: android.content.Intent) {
        super.onDisabled(context, intent)
        // Device admin disabled
    }
    
    override fun onPasswordChanged(context: Context, intent: android.content.Intent, user: android.os.UserHandle) {
        super.onPasswordChanged(context, intent, user)
        // Password changed
    }
    
    override fun onPasswordFailed(context: Context, intent: android.content.Intent, user: android.os.UserHandle) {
        super.onPasswordFailed(context, intent, user)
        // Password attempt failed
    }
    
    override fun onPasswordSucceeded(context: Context, intent: android.content.Intent, user: android.os.UserHandle) {
        super.onPasswordSucceeded(context, intent, user)
        // Password attempt succeeded
    }
}
