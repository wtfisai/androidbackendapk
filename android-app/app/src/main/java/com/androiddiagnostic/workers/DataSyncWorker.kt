package com.androiddiagnostic.workers

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.Data
import com.androiddiagnostic.services.DataSyncService
import com.androiddiagnostic.utils.FirebaseManager
import com.androiddiagnostic.utils.SystemStatsCollector
import kotlinx.coroutines.delay

class DataSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    companion object {
        private const val TAG = "DataSyncWorker"
        const val WORK_NAME = "DataSyncWork"
        const val KEY_SYNC_TYPE = "sync_type"
        const val KEY_FORCE_SYNC = "force_sync"
    }
    
    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting data sync work")
        
        return try {
            val syncType = inputData.getString(KEY_SYNC_TYPE) ?: "all"
            val forceSync = inputData.getBoolean(KEY_FORCE_SYNC, false)
            
            when (syncType) {
                "metrics" -> syncMetrics(forceSync)
                "device_status" -> syncDeviceStatus()
                "health_check" -> performHealthCheck()
                "all" -> syncAll()
                else -> {
                    Log.w(TAG, "Unknown sync type: $syncType")
                    Result.failure()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Data sync work failed", e)
            Result.retry()
        }
    }
    
    private suspend fun syncAll(): Result {
        return try {
            // Sync device metrics
            syncMetrics(false)
            
            // Update device status
            syncDeviceStatus()
            
            // Perform health check
            performHealthCheck()
            
            Log.d(TAG, "All sync operations completed")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Full sync failed", e)
            Result.retry()
        }
    }
    
    private suspend fun syncMetrics(forceSync: Boolean): Result {
        return try {
            val firebaseManager = FirebaseManager()
            val statsCollector = SystemStatsCollector(applicationContext)
            
            // Check if we should skip sync based on battery or network conditions
            if (!forceSync && !shouldSync()) {
                Log.d(TAG, "Skipping metrics sync due to conditions")
                return Result.success()
            }
            
            // Collect current metrics
            val metrics = com.androiddiagnostic.models.DeviceMetrics(
                timestamp = System.currentTimeMillis(),
                cpuUsage = statsCollector.getCPUUsage(),
                memoryInfo = statsCollector.getMemoryInfo(),
                batteryInfo = statsCollector.getBatteryInfo(),
                storageInfo = statsCollector.getStorageInfo(),
                networkInfo = statsCollector.getNetworkInfo(),
                runningProcesses = statsCollector.getRunningProcesses(),
                installedApps = statsCollector.getInstalledApps(),
                systemUptime = android.os.SystemClock.elapsedRealtime(),
                deviceTemperature = statsCollector.getDeviceTemperature()
            )
            
            // Sync to Firebase
            firebaseManager.syncDeviceMetrics(metrics)
            
            Log.d(TAG, "Metrics synced successfully")
            
            // Return success data with sync stats
            val outputData = Data.Builder()
                .putLong("sync_timestamp", System.currentTimeMillis())
                .putString("metrics_summary", "CPU: ${metrics.cpuUsage.toInt()}%, Memory: ${metrics.memoryInfo.usedPercent.toInt()}%")
                .build()
                
            Result.success(outputData)
        } catch (e: Exception) {
            Log.e(TAG, "Metrics sync failed", e)
            Result.retry()
        }
    }
    
    private suspend fun syncDeviceStatus(): Result {
        return try {
            val firebaseManager = FirebaseManager()
            val deviceId = firebaseManager.getDeviceId()
            
            // Update device last seen timestamp and status
            val updates = mapOf(
                "lastSeen" to System.currentTimeMillis(),
                "status" to "online",
                "workerLastRun" to System.currentTimeMillis()
            )
            
            firebaseManager.getFirestore()
                .collection("devices")
                .document(deviceId)
                .update(updates)
            
            Log.d(TAG, "Device status updated")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Device status sync failed", e)
            Result.retry()
        }
    }
    
    private suspend fun performHealthCheck(): Result {
        return try {
            val healthData = collectHealthData()
            
            // Log health status
            firebaseManager.logActivity(
                type = "health_check",
                action = "worker_health_check",
                details = healthData
            )
            
            // Check for critical issues
            val criticalIssues = checkForCriticalIssues(healthData)
            if (criticalIssues.isNotEmpty()) {
                // Create alerts for critical issues
                criticalIssues.forEach { issue ->
                    firebaseManager.createAlert(
                        com.androiddiagnostic.models.Alert(
                            id = System.currentTimeMillis().toString(),
                            deviceId = firebaseManager.getDeviceId(),
                            type = issue.type,
                            severity = "high",
                            title = issue.title,
                            message = issue.message,
                            value = issue.value,
                            threshold = issue.threshold
                        )
                    )
                }
            }
            
            Log.d(TAG, "Health check completed")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Health check failed", e)
            Result.retry()
        }
    }
    
    private fun shouldSync(): Boolean {
        // Check battery level
        val batteryInfo = SystemStatsCollector(applicationContext).getBatteryInfo()
        if (batteryInfo.level < 15 && !batteryInfo.isCharging) {
            Log.d(TAG, "Skipping sync - low battery")
            return false
        }
        
        // Check network type (avoid sync on metered connections if not critical)
        val networkInfo = SystemStatsCollector(applicationContext).getNetworkInfo()
        if (networkInfo.isMetered && networkInfo.type == "Cellular") {
            Log.d(TAG, "Skipping sync - metered connection")
            return false
        }
        
        // Check if device is in doze mode or app standby
        val powerManager = applicationContext.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            if (powerManager.isDeviceIdleMode) {
                Log.d(TAG, "Skipping sync - device in doze mode")
                return false
            }
        }
        
        return true
    }
    
    private suspend fun collectHealthData(): Map<String, Any> {
        val statsCollector = SystemStatsCollector(applicationContext)
        
        return mapOf(
            "timestamp" to System.currentTimeMillis(),
            "cpu_usage" to statsCollector.getCPUUsage(),
            "memory_usage_percent" to statsCollector.getMemoryInfo().usedPercent,
            "battery_level" to statsCollector.getBatteryInfo().level,
            "battery_temperature" to statsCollector.getBatteryInfo().temperature,
            "storage_usage_percent" to (100 - statsCollector.getStorageInfo().internalAvailablePercent),
            "network_connected" to statsCollector.getNetworkInfo().isConnected,
            "device_temperature" to statsCollector.getDeviceTemperature(),
            "system_uptime" to android.os.SystemClock.elapsedRealtime(),
            "running_processes_count" to statsCollector.getRunningProcesses().size
        )
    }
    
    private fun checkForCriticalIssues(healthData: Map<String, Any>): List<HealthIssue> {
        val issues = mutableListOf<HealthIssue>()
        
        // Check CPU usage
        val cpuUsage = healthData["cpu_usage"] as? Double ?: 0.0
        if (cpuUsage > 90.0) {
            issues.add(
                HealthIssue(
                    type = "cpu_critical",
                    title = "Critical CPU Usage",
                    message = "CPU usage is critically high at ${cpuUsage.toInt()}%",
                    value = cpuUsage,
                    threshold = 90.0
                )
            )
        }
        
        // Check memory usage
        val memoryUsage = healthData["memory_usage_percent"] as? Double ?: 0.0
        if (memoryUsage > 95.0) {
            issues.add(
                HealthIssue(
                    type = "memory_critical",
                    title = "Critical Memory Usage",
                    message = "Memory usage is critically high at ${memoryUsage.toInt()}%",
                    value = memoryUsage,
                    threshold = 95.0
                )
            )
        }
        
        // Check battery temperature
        val batteryTemp = healthData["battery_temperature"] as? Double ?: 0.0
        if (batteryTemp > 45.0) {
            issues.add(
                HealthIssue(
                    type = "battery_overheat",
                    title = "Battery Overheating",
                    message = "Battery temperature is ${batteryTemp}°C",
                    value = batteryTemp,
                    threshold = 45.0
                )
            )
        }
        
        // Check storage usage
        val storageUsage = healthData["storage_usage_percent"] as? Double ?: 0.0
        if (storageUsage > 95.0) {
            issues.add(
                HealthIssue(
                    type = "storage_critical",
                    title = "Storage Almost Full",
                    message = "Storage usage is ${storageUsage.toInt()}%",
                    value = storageUsage,
                    threshold = 95.0
                )
            )
        }
        
        return issues
    }
    
    data class HealthIssue(
        val type: String,
        val title: String,
        val message: String,
        val value: Double,
        val threshold: Double
    )
    
    // Initialize Firebase Manager
    private val firebaseManager by lazy { FirebaseManager() }
}