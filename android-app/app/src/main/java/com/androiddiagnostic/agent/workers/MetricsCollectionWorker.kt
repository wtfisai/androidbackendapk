package com.androiddiagnostic.agent.workers

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.androiddiagnostic.agent.data.models.DeviceMetrics
import com.androiddiagnostic.agent.data.repository.MetricsRepository
import com.androiddiagnostic.agent.utils.SystemInfoCollector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MetricsCollectionWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    private val metricsRepository = MetricsRepository(context)
    private val systemInfoCollector = SystemInfoCollector(context)
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            // Collect device metrics
            val metrics = collectMetrics()
            
            // Save to local database
            metricsRepository.saveMetrics(metrics)
            
            // Cleanup old metrics (keep last 7 days)
            metricsRepository.cleanupOldMetrics(7)
            
            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }
    
    private fun collectMetrics(): DeviceMetrics {
        return DeviceMetrics(
            timestamp = System.currentTimeMillis(),
            cpu = getCpuUsage(),
            memory = getMemoryUsage(),
            battery = getBatteryLevel(),
            storage = getStorageUsage(),
            network = getNetworkStatus(),
            temperature = getDeviceTemperature(),
            processes = getRunningProcessCount(),
            uptime = android.os.SystemClock.elapsedRealtime(),
            systemInfo = systemInfoCollector.collectSystemInfo()
        )
    }
    
    private fun getCpuUsage(): Float {
        return try {
            val reader = java.io.RandomAccessFile("/proc/stat", "r")
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
            val batteryManager = applicationContext.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            batteryManager.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            100
        }
    }
    
    private fun getStorageUsage(): Float {
        return try {
            val stat = android.os.StatFs(android.os.Environment.getDataDirectory().path)
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
                if (java.io.File(file).exists()) {
                    val temp = java.io.File(file).readText().trim().toInt()
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
            val activityManager = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            activityManager.runningAppProcesses?.size ?: 0
        } catch (e: Exception) {
            0
        }
    }
}
