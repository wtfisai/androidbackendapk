package com.androiddiagnostic.agent.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import android.app.usage.UsageStatsManager
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.androiddiagnostic.agent.R
import com.androiddiagnostic.agent.data.models.DeviceMetrics
import com.androiddiagnostic.agent.data.repository.MetricsRepository
import com.androiddiagnostic.agent.utils.SystemInfoCollector
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.*
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.TimeUnit

class DeviceMonitorService : Service() {
    
    companion object {
        const val CHANNEL_ID = "DeviceMonitorChannel"
        const val NOTIFICATION_ID = 1001
        const val SYNC_INTERVAL = 30000L // 30 seconds
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var firestore: FirebaseFirestore
    private lateinit var auth: FirebaseAuth
    private lateinit var metricsRepository: MetricsRepository
    private lateinit var systemInfoCollector: SystemInfoCollector
    private var monitoringJob: Job? = null
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Firebase
        firestore = FirebaseFirestore.getInstance()
        auth = FirebaseAuth.getInstance()
        
        // Initialize repositories and collectors
        metricsRepository = MetricsRepository(applicationContext)
        systemInfoCollector = SystemInfoCollector(applicationContext)
        
        // Create notification channel
        createNotificationChannel()
        
        // Start foreground service
        startForeground(NOTIFICATION_ID, createNotification())
        
        // Start monitoring
        startMonitoring()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        monitoringJob?.cancel()
        serviceScope.cancel()
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
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Device Monitor Active")
            .setContentText("Monitoring device metrics and status")
            .setSmallIcon(R.drawable.ic_monitoring)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
    
    private fun startMonitoring() {
        monitoringJob = serviceScope.launch {
            while (isActive) {
                try {
                    collectAndSyncMetrics()
                    delay(SYNC_INTERVAL)
                } catch (e: Exception) {
                    e.printStackTrace()
                    delay(SYNC_INTERVAL * 2) // Back off on error
                }
            }
        }
    }
    
    private suspend fun collectAndSyncMetrics() {
        val metrics = collectDeviceMetrics()
        
        // Save locally
        metricsRepository.saveMetrics(metrics)
        
        // Sync to Firebase if authenticated
        auth.currentUser?.let { user ->
            syncMetricsToFirebase(user.uid, metrics)
        }
    }
    
    private fun collectDeviceMetrics(): DeviceMetrics {
        return DeviceMetrics(
            timestamp = System.currentTimeMillis(),
            cpu = getCpuUsage(),
            memory = getMemoryUsage(),
            battery = getBatteryLevel(),
            storage = getStorageUsage(),
            network = getNetworkStatus(),
            temperature = getDeviceTemperature(),
            processes = getRunningProcessCount(),
            uptime = SystemClock.elapsedRealtime(),
            systemInfo = systemInfoCollector.collectSystemInfo()
        )
    }
    
    private fun getCpuUsage(): Float {
        return try {
            val reader = RandomAccessFile("/proc/stat", "r")
            val load = reader.readLine()
            reader.close()
            
            val toks = load.split(" +".toRegex()).toTypedArray()
            val idle1 = toks[4].toLong()
            val cpu1 = toks[1].toLong() + toks[2].toLong() + toks[3].toLong() +
                    toks[5].toLong() + toks[6].toLong() + toks[7].toLong()
            
            Thread.sleep(360)
            
            reader.use {
                val load2 = it.readLine()
                val toks2 = load2.split(" +".toRegex()).toTypedArray()
                val idle2 = toks2[4].toLong()
                val cpu2 = toks2[1].toLong() + toks2[2].toLong() + toks2[3].toLong() +
                        toks2[5].toLong() + toks2[6].toLong() + toks2[7].toLong()
                
                ((cpu2 - cpu1).toFloat() / ((cpu2 + idle2) - (cpu1 + idle1)) * 100)
            }
        } catch (e: Exception) {
            0f
        }
    }
    
    private fun getMemoryUsage(): Float {
        return try {
            val runtime = Runtime.getRuntime()
            val usedMemory = runtime.totalMemory() - runtime.freeMemory()
            val maxMemory = runtime.maxMemory()
            (usedMemory.toFloat() / maxMemory * 100)
        } catch (e: Exception) {
            0f
        }
    }
    
    private fun getBatteryLevel(): Int {
        return try {
            val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            100
        }
    }
    
    private fun getStorageUsage(): Float {
        return try {
            val stat = StatFs(Environment.getDataDirectory().path)
            val blockSize = stat.blockSizeLong
            val totalBlocks = stat.blockCountLong
            val availableBlocks = stat.availableBlocksLong
            
            val total = totalBlocks * blockSize
            val available = availableBlocks * blockSize
            val used = total - available
            
            (used.toFloat() / total * 100)
        } catch (e: Exception) {
            0f
        }
    }
    
    private fun getNetworkStatus(): String {
        return if (systemInfoCollector.isNetworkAvailable()) {
            if (systemInfoCollector.isWifiConnected()) "wifi" else "mobile"
        } else {
            "offline"
        }
    }
    
    private fun getDeviceTemperature(): Float {
        return try {
            val thermalFiles = listOf(
                "/sys/class/thermal/thermal_zone0/temp",
                "/sys/devices/virtual/thermal/thermal_zone0/temp"
            )
            
            for (file in thermalFiles) {
                if (File(file).exists()) {
                    val temp = File(file).readText().trim().toInt()
                    return temp / 1000f // Convert to Celsius
                }
            }
            0f
        } catch (e: Exception) {
            0f
        }
    }
    
    private fun getRunningProcessCount(): Int {
        return try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            activityManager.runningAppProcesses?.size ?: 0
        } catch (e: Exception) {
            0
        }
    }
    
    private suspend fun syncMetricsToFirebase(userId: String, metrics: DeviceMetrics) {
        withContext(Dispatchers.IO) {
            try {
                val deviceId = getDeviceId()
                
                firestore.collection("devices")
                    .document(deviceId)
                    .update(
                        mapOf(
                            "metrics" to mapOf(
                                "cpu" to metrics.cpu,
                                "memory" to metrics.memory,
                                "battery" to metrics.battery,
                                "storage" to metrics.storage,
                                "network" to metrics.network,
                                "temperature" to metrics.temperature,
                                "processes" to metrics.processes,
                                "uptime" to metrics.uptime
                            ),
                            "lastSeen" to System.currentTimeMillis(),
                            "status" to "online"
                        )
                    )
                    .addOnFailureListener { e ->
                        // Log error or handle offline scenario
                        e.printStackTrace()
                    }
                
                // Also store in activities collection for history
                firestore.collection("activities")
                    .add(
                        mapOf(
                            "deviceId" to deviceId,
                            "userId" to userId,
                            "type" to "metrics",
                            "data" to metrics,
                            "timestamp" to System.currentTimeMillis()
                        )
                    )
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    private fun getDeviceId(): String {
        // Get or create a unique device ID
        val sharedPrefs = getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
        var deviceId = sharedPrefs.getString("device_id", null)
        
        if (deviceId == null) {
            deviceId = "${Build.MANUFACTURER}_${Build.MODEL}_${System.currentTimeMillis()}"
                .replace(" ", "_")
                .replace("/", "_")
            
            sharedPrefs.edit().putString("device_id", deviceId).apply()
        }
        
        return deviceId
    }
}
