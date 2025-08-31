package com.androiddiagnostic.agent.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import com.androiddiagnostic.agent.data.models.SystemInfo
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

class SystemInfoCollector(private val context: Context) {
    
    fun collectSystemInfo(): SystemInfo {
        return SystemInfo(
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            androidVersion = Build.VERSION.RELEASE,
            sdkVersion = Build.VERSION.SDK_INT,
            kernelVersion = getKernelVersion(),
            buildNumber = Build.DISPLAY,
            hardware = Build.HARDWARE,
            board = Build.BOARD,
            device = Build.DEVICE,
            product = Build.PRODUCT,
            brand = Build.BRAND,
            display = Build.DISPLAY,
            fingerprint = Build.FINGERPRINT,
            tags = Build.TAGS,
            type = Build.TYPE,
            user = Build.USER,
            radioVersion = Build.getRadioVersion(),
            bootloader = Build.BOOTLOADER,
            isRooted = checkRootAccess(),
            hasAdb = checkAdbEnabled()
        )
    }
    
    fun isNetworkAvailable(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
            
            return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                   capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } else {
            @Suppress("DEPRECATION")
            val networkInfo = connectivityManager.activeNetworkInfo
            @Suppress("DEPRECATION")
            return networkInfo != null && networkInfo.isConnected
        }
    }
    
    fun isWifiConnected(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
            
            return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        } else {
            @Suppress("DEPRECATION")
            val networkInfo = connectivityManager.activeNetworkInfo
            @Suppress("DEPRECATION")
            return networkInfo != null && networkInfo.type == ConnectivityManager.TYPE_WIFI
        }
    }
    
    private fun getKernelVersion(): String? {
        return try {
            val process = Runtime.getRuntime().exec("uname -r")
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val version = reader.readLine()
            reader.close()
            version
        } catch (e: Exception) {
            null
        }
    }
    
    private fun checkRootAccess(): Boolean {
        return checkRootMethod1() || checkRootMethod2() || checkRootMethod3()
    }
    
    private fun checkRootMethod1(): Boolean {
        val paths = arrayOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su"
        )
        
        return paths.any { File(it).exists() }
    }
    
    private fun checkRootMethod2(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val line = reader.readLine()
            reader.close()
            line != null
        } catch (e: Exception) {
            false
        }
    }
    
    private fun checkRootMethod3(): Boolean {
        return Build.TAGS != null && Build.TAGS.contains("test-keys")
    }
    
    private fun checkAdbEnabled(): Boolean {
        return try {
            android.provider.Settings.Global.getInt(
                context.contentResolver,
                android.provider.Settings.Global.ADB_ENABLED
            ) == 1
        } catch (e: Exception) {
            false
        }
    }
}
