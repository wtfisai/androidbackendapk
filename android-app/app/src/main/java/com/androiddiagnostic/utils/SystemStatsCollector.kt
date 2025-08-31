package com.androiddiagnostic.utils

import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.*
import android.telephony.TelephonyManager
import android.util.Log
import com.androiddiagnostic.models.*
import java.io.*
import kotlin.math.roundToInt

class SystemStatsCollector(private val context: Context) {
    
    companion object {
        private const val TAG = "SystemStatsCollector"
    }
    
    private val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val packageManager = context.packageManager
    
    fun getCPUUsage(): Double {
        return try {
            val reader = RandomAccessFile("/proc/stat", "r")
            val load = reader.readLine()
            val toks = load.split(" ")
            
            val idle1 = toks[4].toLong()
            val cpu1 = toks[2].toLong() + toks[3].toLong() + toks[5].toLong() + 
                      toks[6].toLong() + toks[7].toLong() + toks[8].toLong()
            
            Thread.sleep(360)
            
            reader.seek(0)
            val load2 = reader.readLine()
            val toks2 = load2.split(" ")
            
            val idle2 = toks2[4].toLong()
            val cpu2 = toks2[2].toLong() + toks2[3].toLong() + toks2[5].toLong() + 
                      toks2[6].toLong() + toks2[7].toLong() + toks2[8].toLong()
            
            reader.close()
            
            val cpuUsage = (cpu2 - cpu1).toDouble() / ((cpu2 + idle2) - (cpu1 + idle1)).toDouble() * 100
            cpuUsage.coerceIn(0.0, 100.0)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting CPU usage", e)
            -1.0
        }
    }
    
    fun getMemoryInfo(): MemoryInfo {
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        
        val totalMemory = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            memInfo.totalMem
        } else {
            getTotalMemoryFromProc()
        }
        
        val availableMemory = memInfo.availMem
        val usedMemory = totalMemory - availableMemory
        val threshold = memInfo.threshold
        
        return MemoryInfo(
            total = totalMemory / (1024 * 1024), // Convert to MB
            available = availableMemory / (1024 * 1024),
            used = usedMemory / (1024 * 1024),
            availablePercent = (availableMemory.toDouble() / totalMemory * 100).roundToInt().toDouble(),
            usedPercent = (usedMemory.toDouble() / totalMemory * 100).roundToInt().toDouble(),
            threshold = threshold / (1024 * 1024),
            lowMemory = memInfo.lowMemory
        )
    }
    
    private fun getTotalMemoryFromProc(): Long {
        return try {
            val reader = BufferedReader(FileReader("/proc/meminfo"))
            val line = reader.readLine()
            reader.close()
            
            val parts = line.split("\\s+".toRegex())
            parts[1].toLong() * 1024 // Convert from KB to bytes
        } catch (e: Exception) {
            Log.e(TAG, "Error reading total memory from /proc/meminfo", e)
            0L
        }
    }
    
    fun getBatteryInfo(): BatteryInfo {
        val batteryStatus = context.registerReceiver(
            null, 
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct = if (level >= 0 && scale > 0) {
            (level.toFloat() / scale.toFloat() * 100).toInt()
        } else {
            -1
        }
        
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                        status == BatteryManager.BATTERY_STATUS_FULL
        
        val plugged = batteryStatus?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val chargeType = when (plugged) {
            BatteryManager.BATTERY_PLUGGED_AC -> "AC"
            BatteryManager.BATTERY_PLUGGED_USB -> "USB"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
            else -> "None"
        }
        
        val health = batteryStatus?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1
        val healthString = when (health) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheat"
            BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
            BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
            else -> "Unknown"
        }
        
        val temperature = (batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0) / 10.0
        val voltage = batteryStatus?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0) ?: 0
        
        return BatteryInfo(
            level = batteryPct,
            isCharging = isCharging,
            chargeType = chargeType,
            health = healthString,
            temperature = temperature,
            voltage = voltage / 1000.0, // Convert to volts
            technology = batteryStatus?.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY) ?: "Unknown"
        )
    }
    
    fun getStorageInfo(): StorageInfo {
        val statFs = StatFs(Environment.getDataDirectory().path)
        
        val blockSize = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            statFs.blockSizeLong
        } else {
            statFs.blockSize.toLong()
        }
        
        val totalBlocks = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            statFs.blockCountLong
        } else {
            statFs.blockCount.toLong()
        }
        
        val availableBlocks = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            statFs.availableBlocksLong
        } else {
            statFs.availableBlocks.toLong()
        }
        
        val totalInternal = (totalBlocks * blockSize) / (1024 * 1024 * 1024) // GB
        val availableInternal = (availableBlocks * blockSize) / (1024 * 1024 * 1024) // GB
        val usedInternal = totalInternal - availableInternal
        
        // External storage
        var totalExternal = 0L
        var availableExternal = 0L
        
        if (Environment.getExternalStorageState() == Environment.MEDIA_MOUNTED) {
            val externalStatFs = StatFs(Environment.getExternalStorageDirectory().path)
            
            val externalBlockSize = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                externalStatFs.blockSizeLong
            } else {
                externalStatFs.blockSize.toLong()
            }
            
            val externalTotalBlocks = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                externalStatFs.blockCountLong
            } else {
                externalStatFs.blockCount.toLong()
            }
            
            val externalAvailableBlocks = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                externalStatFs.availableBlocksLong
            } else {
                externalStatFs.availableBlocks.toLong()
            }
            
            totalExternal = (externalTotalBlocks * externalBlockSize) / (1024 * 1024 * 1024)
            availableExternal = (externalAvailableBlocks * externalBlockSize) / (1024 * 1024 * 1024)
        }
        
        return StorageInfo(
            internalTotal = totalInternal,
            internalUsed = usedInternal,
            internalAvailable = availableInternal,
            internalAvailablePercent = (availableInternal.toDouble() / totalInternal * 100).roundToInt().toDouble(),
            externalTotal = totalExternal,
            externalUsed = totalExternal - availableExternal,
            externalAvailable = availableExternal,
            externalAvailablePercent = if (totalExternal > 0) {
                (availableExternal.toDouble() / totalExternal * 100).roundToInt().toDouble()
            } else 0.0
        )
    }
    
    fun getNetworkInfo(): NetworkInfo {
        val network = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(network)
        
        val isConnected = capabilities != null
        val networkType = when {
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "WiFi"
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Cellular"
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "Ethernet"
            capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true -> "VPN"
            else -> "Unknown"
        }
        
        val downloadSpeed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            capabilities?.linkDownstreamBandwidthKbps?.div(1000) ?: 0 // Convert to Mbps
        } else {
            0
        }
        
        val uploadSpeed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            capabilities?.linkUpstreamBandwidthKbps?.div(1000) ?: 0 // Convert to Mbps
        } else {
            0
        }
        
        // Get signal strength for cellular
        var signalStrength = -1
        if (networkType == "Cellular" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    signalStrength = telephonyManager.signalStrength?.level ?: -1
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "Permission denied for signal strength", e)
            }
        }
        
        return NetworkInfo(
            isConnected = isConnected,
            type = networkType,
            signalStrength = signalStrength,
            downloadSpeed = downloadSpeed,
            uploadSpeed = uploadSpeed,
            isMetered = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false,
            isRoaming = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING) == false
        )
    }
    
    fun getRunningProcesses(): List<ProcessInfo> {
        val processes = mutableListOf<ProcessInfo>()
        
        try {
            val runningApps = activityManager.runningAppProcesses ?: return processes
            
            for (processInfo in runningApps) {
                val memInfo = activityManager.getProcessMemoryInfo(intArrayOf(processInfo.pid))
                val memory = if (memInfo.isNotEmpty()) {
                    memInfo[0].totalPss / 1024 // Convert to MB
                } else {
                    0
                }
                
                processes.add(
                    ProcessInfo(
                        pid = processInfo.pid,
                        name = processInfo.processName,
                        uid = processInfo.uid,
                        importance = getImportanceString(processInfo.importance),
                        memoryUsage = memory,
                        cpuUsage = getProcessCPUUsage(processInfo.pid)
                    )
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting running processes", e)
        }
        
        return processes
    }
    
    private fun getImportanceString(importance: Int): String {
        return when (importance) {
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND -> "Foreground"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE -> "Visible"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE -> "Service"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_CACHED -> "Cached"
            else -> "Background"
        }
    }
    
    private fun getProcessCPUUsage(pid: Int): Double {
        return try {
            val reader = BufferedReader(FileReader("/proc/$pid/stat"))
            val stats = reader.readLine()
            reader.close()
            
            val fields = stats.split(" ")
            val utime = fields[13].toLong()
            val stime = fields[14].toLong()
            val totalTime = utime + stime
            
            // This is a simplified calculation
            // In production, you'd need to track previous values and calculate delta
            (totalTime.toDouble() / SystemClock.elapsedRealtime() * 100).coerceIn(0.0, 100.0)
        } catch (e: Exception) {
            0.0
        }
    }
    
    fun getInstalledApps(): List<AppInfo> {
        val apps = mutableListOf<AppInfo>()
        
        try {
            val packages = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
            
            for (packageInfo in packages) {
                val appInfo = AppInfo(
                    packageName = packageInfo.packageName,
                    appName = packageManager.getApplicationLabel(packageInfo).toString(),
                    versionName = try {
                        packageManager.getPackageInfo(packageInfo.packageName, 0).versionName ?: "Unknown"
                    } catch (e: Exception) {
                        "Unknown"
                    },
                    versionCode = try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            packageManager.getPackageInfo(packageInfo.packageName, 0).longVersionCode
                        } else {
                            packageManager.getPackageInfo(packageInfo.packageName, 0).versionCode.toLong()
                        }
                    } catch (e: Exception) {
                        0L
                    },
                    isSystemApp = (packageInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0,
                    installTime = try {
                        packageManager.getPackageInfo(packageInfo.packageName, 0).firstInstallTime
                    } catch (e: Exception) {
                        0L
                    },
                    updateTime = try {
                        packageManager.getPackageInfo(packageInfo.packageName, 0).lastUpdateTime
                    } catch (e: Exception) {
                        0L
                    }
                )
                apps.add(appInfo)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting installed apps", e)
        }
        
        return apps
    }
    
    fun getDeviceTemperature(): Double {
        // Try to read from thermal zone (requires root on most devices)
        val thermalFiles = arrayOf(
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/devices/virtual/thermal/thermal_zone0/temp",
            "/sys/devices/system/cpu/cpu0/cpufreq/cpu_temp",
            "/sys/devices/platform/coretemp.0/temp1_input"
        )
        
        for (file in thermalFiles) {
            try {
                val reader = BufferedReader(FileReader(file))
                val temp = reader.readLine()
                reader.close()
                
                // Temperature is usually in millidegrees Celsius
                return temp.toDouble() / 1000.0
            } catch (e: Exception) {
                // Continue to next file
            }
        }
        
        // If no thermal file is accessible, return battery temperature as fallback
        return getBatteryInfo().temperature
    }
}