package com.androiddiagnostic.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import android.app.usage.UsageStatsManager
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.androiddiagnostic.DiagnosticApplication
import com.androiddiagnostic.R
import com.androiddiagnostic.models.DeviceMetrics
import com.androiddiagnostic.utils.SystemStatsCollector
import com.androiddiagnostic.utils.FirebaseManager
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit
import android.util.Log

class DeviceMonitorService : Service() {
    
    companion object {
        private const val TAG = "DeviceMonitorService"
        private const val NOTIFICATION_ID = 1001
        private const val MONITORING_INTERVAL = 30L // seconds
        private const val CHANNEL_ID = DiagnosticApplication.NOTIFICATION_CHANNEL_ID
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var statsCollector: SystemStatsCollector
    private lateinit var firebaseManager: FirebaseManager
    private lateinit var notificationManager: NotificationManager
    private var monitoringJob: Job? = null
    
    // System managers
    private lateinit var activityManager: ActivityManager
    private lateinit var batteryManager: BatteryManager
    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var telephonyManager: TelephonyManager
    private lateinit var usageStatsManager: UsageStatsManager
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        
        initializeManagers()
        initializeComponents()
        createNotificationChannel()
    }
    
    private fun initializeManagers() {
        activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        }
    }
    
    private fun initializeComponents() {
        statsCollector = SystemStatsCollector(this)
        firebaseManager = (application as DiagnosticApplication).firebaseManager
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Device Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous device monitoring service"
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand")
        
        when (intent?.action) {
            "START_MONITORING" -> startMonitoring()
            "STOP_MONITORING" -> stopMonitoring()
            "FORCE_SYNC" -> forceSync()
            else -> startMonitoring()
        }
        
        return START_STICKY
    }
    
    private fun startMonitoring() {
        Log.d(TAG, "Starting monitoring")
        
        // Start foreground service
        startForeground(NOTIFICATION_ID, createNotification())
        
        // Start monitoring job
        monitoringJob?.cancel()
        monitoringJob = serviceScope.launch {
            while (isActive) {
                try {
                    collectAndSyncMetrics()
                    delay(MONITORING_INTERVAL * 1000)
                } catch (e: Exception) {
                    Log.e(TAG, "Error in monitoring loop", e)
                    delay(60000) // Wait 1 minute on error
                }
            }
        }
        
        // Schedule periodic sync with WorkManager
        schedulePeriodicSync()
    }
    
    private fun stopMonitoring() {
        Log.d(TAG, "Stopping monitoring")
        monitoringJob?.cancel()
        WorkManager.getInstance(this).cancelAllWorkByTag("DeviceSync")
    }
    
    private fun forceSync() {
        serviceScope.launch {
            collectAndSyncMetrics()
        }
    }
    
    private suspend fun collectAndSyncMetrics() = withContext(Dispatchers.IO) {
        try {
            // Collect metrics
            val metrics = collectDeviceMetrics()
            
            // Update notification with latest metrics
            updateNotification(metrics)
            
            // Sync to Firebase
            firebaseManager.syncDeviceMetrics(metrics)
            
            // Check for alerts
            checkMetricAlerts(metrics)
            
            Log.d(TAG, "Metrics collected and synced: ${metrics.summary()}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to collect/sync metrics", e)
        }
    }
    
    private fun collectDeviceMetrics(): DeviceMetrics {
        return DeviceMetrics(
            timestamp = System.currentTimeMillis(),
            cpuUsage = statsCollector.getCPUUsage(),
            memoryInfo = statsCollector.getMemoryInfo(),
            batteryInfo = statsCollector.getBatteryInfo(),
            storageInfo = statsCollector.getStorageInfo(),
            networkInfo = statsCollector.getNetworkInfo(),
            runningProcesses = statsCollector.getRunningProcesses(),
            installedApps = statsCollector.getInstalledApps(),
            systemUptime = SystemClock.elapsedRealtime(),
            deviceTemperature = statsCollector.getDeviceTemperature()
        )
    }
    
    private fun checkMetricAlerts(metrics: DeviceMetrics) {
        // Check CPU usage
        if (metrics.cpuUsage > 80) {
            showAlert("High CPU Usage", "CPU usage is at ${metrics.cpuUsage.toInt()}%")
        }
        
        // Check memory
        if (metrics.memoryInfo.availablePercent < 10) {
            showAlert("Low Memory", "Available memory is below 10%")
        }
        
        // Check battery
        if (metrics.batteryInfo.level < 15 && !metrics.batteryInfo.isCharging) {
            showAlert("Low Battery", "Battery level is ${metrics.batteryInfo.level}%")
        }
        
        // Check storage
        if (metrics.storageInfo.internalAvailablePercent < 5) {
            showAlert("Low Storage", "Internal storage is almost full")
        }
    }
    
    private fun showAlert(title: String, message: String) {
        val notification = NotificationCompat.Builder(this, DiagnosticApplication.NOTIFICATION_CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_warning)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
            
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
    
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val stopIntent = Intent(this, DeviceMonitorService::class.java).apply {
            action = "STOP_MONITORING"
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Device Monitoring Active")
            .setContentText("Monitoring device metrics...")
            .setSmallIcon(R.drawable.ic_monitoring)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .addAction(R.drawable.ic_stop, "Stop", stopPendingIntent)
            .build()
    }
    
    private fun updateNotification(metrics: DeviceMetrics) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Device Monitoring Active")
            .setContentText("CPU: ${metrics.cpuUsage.toInt()}% | RAM: ${metrics.memoryInfo.usedPercent.toInt()}% | Battery: ${metrics.batteryInfo.level}%")
            .setSmallIcon(R.drawable.ic_monitoring)
            .setOngoing(true)
            .build()
            
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
    
    private fun schedulePeriodicSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
            
        val syncRequest = PeriodicWorkRequestBuilder<DataSyncWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .addTag("DeviceSync")
            .build()
            
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "DeviceSync",
            ExistingPeriodicWorkPolicy.REPLACE,
            syncRequest
        )
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service onDestroy")
        serviceScope.cancel()
        stopForeground(true)
    }
}

// Extension function for DeviceMetrics summary
private fun DeviceMetrics.summary(): String {
    return "CPU: ${cpuUsage.toInt()}%, Memory: ${memoryInfo.usedPercent.toInt()}%, Battery: ${batteryInfo.level}%"
}