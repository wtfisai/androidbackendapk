package com.androiddiagnostic.models

import com.google.firebase.firestore.PropertyName
import java.io.Serializable

data class DeviceMetrics(
    val timestamp: Long = System.currentTimeMillis(),
    val cpuUsage: Double = 0.0,
    val memoryInfo: MemoryInfo = MemoryInfo(),
    val batteryInfo: BatteryInfo = BatteryInfo(),
    val storageInfo: StorageInfo = StorageInfo(),
    val networkInfo: NetworkInfo = NetworkInfo(),
    val runningProcesses: List<ProcessInfo> = emptyList(),
    val installedApps: List<AppInfo> = emptyList(),
    val systemUptime: Long = 0L,
    val deviceTemperature: Double = 0.0
) : Serializable

data class MemoryInfo(
    val total: Long = 0L, // MB
    val available: Long = 0L, // MB
    val used: Long = 0L, // MB
    val availablePercent: Double = 0.0,
    val usedPercent: Double = 0.0,
    val threshold: Long = 0L, // MB
    val lowMemory: Boolean = false
) : Serializable

data class BatteryInfo(
    val level: Int = 0, // Percentage
    val isCharging: Boolean = false,
    val chargeType: String = "None",
    val health: String = "Unknown",
    val temperature: Double = 0.0, // Celsius
    val voltage: Double = 0.0, // Volts
    val technology: String = "Unknown"
) : Serializable

data class StorageInfo(
    val internalTotal: Long = 0L, // GB
    val internalUsed: Long = 0L, // GB
    val internalAvailable: Long = 0L, // GB
    val internalAvailablePercent: Double = 0.0,
    val externalTotal: Long = 0L, // GB
    val externalUsed: Long = 0L, // GB
    val externalAvailable: Long = 0L, // GB
    val externalAvailablePercent: Double = 0.0
) : Serializable

data class NetworkInfo(
    val isConnected: Boolean = false,
    val type: String = "Unknown",
    val signalStrength: Int = -1,
    val downloadSpeed: Int = 0, // Mbps
    val uploadSpeed: Int = 0, // Mbps
    val isMetered: Boolean = false,
    val isRoaming: Boolean = false
) : Serializable

data class ProcessInfo(
    val pid: Int = 0,
    val name: String = "",
    val uid: Int = 0,
    val importance: String = "",
    val memoryUsage: Int = 0, // MB
    val cpuUsage: Double = 0.0 // Percentage
) : Serializable

data class AppInfo(
    val packageName: String = "",
    val appName: String = "",
    val versionName: String = "",
    val versionCode: Long = 0L,
    val isSystemApp: Boolean = false,
    val installTime: Long = 0L,
    val updateTime: Long = 0L
) : Serializable

data class DeviceInfo(
    @PropertyName("deviceId") val deviceId: String = "",
    @PropertyName("userId") val userId: String = "",
    @PropertyName("name") val name: String = "",
    @PropertyName("model") val model: String = "",
    @PropertyName("manufacturer") val manufacturer: String = "",
    @PropertyName("androidVersion") val androidVersion: String = "",
    @PropertyName("apiLevel") val apiLevel: Int = 0,
    @PropertyName("serialNumber") val serialNumber: String = "",
    @PropertyName("imei") val imei: String = "",
    @PropertyName("status") val status: String = "offline",
    @PropertyName("capabilities") val capabilities: DeviceCapabilities = DeviceCapabilities(),
    @PropertyName("registeredAt") val registeredAt: Long = 0L,
    @PropertyName("lastSeen") val lastSeen: Long = 0L
) : Serializable

data class DeviceCapabilities(
    val root: Boolean = false,
    val adb: Boolean = false,
    val accessibility: Boolean = false,
    val deviceAdmin: Boolean = false,
    val systemApps: Boolean = false,
    val usageStats: Boolean = false,
    val notifications: Boolean = false,
    val location: Boolean = false
) : Serializable

data class Command(
    @PropertyName("commandId") val commandId: String = "",
    @PropertyName("deviceId") val deviceId: String = "",
    @PropertyName("userId") val userId: String = "",
    @PropertyName("type") val type: String = "", // shell, adb, system, custom
    @PropertyName("command") val command: String = "",
    @PropertyName("parameters") val parameters: Map<String, Any> = emptyMap(),
    @PropertyName("status") val status: String = "pending", // pending, executing, completed, failed, timeout
    @PropertyName("priority") val priority: String = "normal", // low, normal, high, critical
    @PropertyName("result") val result: String? = null,
    @PropertyName("error") val error: String? = null,
    @PropertyName("timeout") val timeout: Long = 30000L, // milliseconds
    @PropertyName("createdAt") val createdAt: Long = 0L,
    @PropertyName("startedAt") val startedAt: Long? = null,
    @PropertyName("completedAt") val completedAt: Long? = null
) : Serializable

data class Alert(
    val id: String = "",
    val deviceId: String = "",
    val type: String = "", // cpu_high, memory_low, battery_low, storage_low, etc.
    val severity: String = "medium", // low, medium, high, critical
    val title: String = "",
    val message: String = "",
    val value: Double = 0.0,
    val threshold: Double = 0.0,
    val timestamp: Long = System.currentTimeMillis(),
    val acknowledged: Boolean = false
) : Serializable

data class User(
    @PropertyName("uid") val uid: String = "",
    @PropertyName("email") val email: String = "",
    @PropertyName("displayName") val displayName: String = "",
    @PropertyName("photoUrl") val photoUrl: String? = null,
    @PropertyName("subscription") val subscription: Subscription = Subscription(),
    @PropertyName("settings") val settings: UserSettings = UserSettings(),
    @PropertyName("createdAt") val createdAt: Long = 0L,
    @PropertyName("updatedAt") val updatedAt: Long = 0L
) : Serializable

data class Subscription(
    val plan: String = "free", // free, pro, business, enterprise
    val status: String = "active", // active, canceled, past_due
    val deviceLimit: Int = 1,
    val features: List<String> = emptyList(),
    val currentPeriodEnd: Long = 0L
) : Serializable

data class UserSettings(
    val notifications: Boolean = true,
    val emailNotifications: Boolean = false,
    val smsNotifications: Boolean = false,
    val alertRules: List<AlertRule> = emptyList()
) : Serializable

data class AlertRule(
    val id: String = "",
    val name: String = "",
    val type: String = "", // cpu_high, memory_low, battery_low, storage_low
    val threshold: Double = 0.0,
    val enabled: Boolean = true,
    val devices: List<String> = emptyList() // Device IDs
) : Serializable