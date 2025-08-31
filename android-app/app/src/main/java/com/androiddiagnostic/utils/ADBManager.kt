package com.androiddiagnostic.utils

import android.content.Context
import android.util.Log
import com.androiddiagnostic.services.CommandExecutorService.CommandResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader

class ADBManager(private val context: Context) {
    
    companion object {
        private const val TAG = "ADBManager"
        
        // Whitelisted ADB commands for security
        private val WHITELISTED_COMMANDS = listOf(
            "devices",
            "shell dumpsys",
            "shell pm list",
            "shell am start",
            "shell input",
            "shell getprop",
            "shell settings",
            "logcat",
            "bugreport",
            "shell screenrecord",
            "shell screencap"
        )
    }
    
    fun isADBAvailable(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("which adb")
            val exitCode = process.waitFor()
            exitCode == 0
        } catch (e: Exception) {
            Log.e(TAG, "ADB check failed", e)
            false
        }
    }
    
    suspend fun executeCommand(command: String): CommandResult = withContext(Dispatchers.IO) {
        if (!isCommandWhitelisted(command)) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "ADB command not whitelisted for security reasons"
            )
        }
        
        try {
            val fullCommand = if (command.startsWith("adb ")) {
                command
            } else {
                "adb $command"
            }
            
            val process = Runtime.getRuntime().exec(fullCommand)
            val output = StringBuilder()
            val error = StringBuilder()
            
            // Read output
            val outputReader = BufferedReader(InputStreamReader(process.inputStream))
            val errorReader = BufferedReader(InputStreamReader(process.errorStream))
            
            var line: String?
            while (outputReader.readLine().also { line = it } != null) {
                output.append(line).append("\n")
            }
            
            while (errorReader.readLine().also { line = it } != null) {
                error.append(line).append("\n")
            }
            
            val exitCode = process.waitFor()
            
            CommandResult(
                success = exitCode == 0,
                output = output.toString(),
                error = if (exitCode != 0) error.toString() else null
            )
        } catch (e: Exception) {
            Log.e(TAG, "ADB command execution failed", e)
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "ADB command execution failed"
            )
        }
    }
    
    private fun isCommandWhitelisted(command: String): Boolean {
        val normalizedCommand = command.trim().toLowerCase()
        
        // Check if command starts with any whitelisted command
        return WHITELISTED_COMMANDS.any { whitelisted ->
            normalizedCommand.startsWith(whitelisted) || 
            normalizedCommand.startsWith("adb $whitelisted")
        }
    }
    
    suspend fun getConnectedDevices(): List<DeviceInfo> = withContext(Dispatchers.IO) {
        val devices = mutableListOf<DeviceInfo>()
        
        try {
            val result = executeCommand("devices -l")
            if (result.success) {
                val lines = result.output.split("\n")
                for (line in lines) {
                    if (line.contains("device") && !line.contains("List of devices")) {
                        val parts = line.split("\\s+".toRegex())
                        if (parts.size >= 2) {
                            val serial = parts[0]
                            val status = parts[1]
                            
                            // Extract additional info if available
                            val model = extractValue(line, "model:")
                            val device = extractValue(line, "device:")
                            val transportId = extractValue(line, "transport_id:")
                            
                            devices.add(
                                DeviceInfo(
                                    serial = serial,
                                    status = status,
                                    model = model,
                                    device = device,
                                    transportId = transportId
                                )
                            )
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get connected devices", e)
        }
        
        devices
    }
    
    private fun extractValue(line: String, key: String): String {
        val index = line.indexOf(key)
        if (index != -1) {
            val start = index + key.length
            val end = line.indexOf(" ", start)
            return if (end != -1) {
                line.substring(start, end)
            } else {
                line.substring(start)
            }
        }
        return ""
    }
    
    suspend fun installAPK(apkPath: String, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val command = if (deviceSerial != null) {
            "-s $deviceSerial install -r $apkPath"
        } else {
            "install -r $apkPath"
        }
        executeCommand(command)
    }
    
    suspend fun uninstallPackage(packageName: String, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val command = if (deviceSerial != null) {
            "-s $deviceSerial uninstall $packageName"
        } else {
            "uninstall $packageName"
        }
        executeCommand(command)
    }
    
    suspend fun captureScreenshot(outputPath: String, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val deviceCommand = if (deviceSerial != null) "-s $deviceSerial" else ""
        val command = "$deviceCommand shell screencap -p /sdcard/screenshot.png"
        val captureResult = executeCommand(command)
        
        if (captureResult.success) {
            // Pull the screenshot from device
            val pullCommand = "$deviceCommand pull /sdcard/screenshot.png $outputPath"
            executeCommand(pullCommand)
        } else {
            captureResult
        }
    }
    
    suspend fun startScreenRecording(outputPath: String, duration: Int = 180, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val deviceCommand = if (deviceSerial != null) "-s $deviceSerial" else ""
        val command = "$deviceCommand shell screenrecord --time-limit $duration /sdcard/recording.mp4"
        executeCommand(command)
    }
    
    suspend fun getLogcat(filter: String? = null, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val deviceCommand = if (deviceSerial != null) "-s $deviceSerial" else ""
        val filterCommand = filter ?: ""
        val command = "$deviceCommand logcat -d $filterCommand"
        executeCommand(command)
    }
    
    suspend fun getDumpsys(service: String, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val deviceCommand = if (deviceSerial != null) "-s $deviceSerial" else ""
        val command = "$deviceCommand shell dumpsys $service"
        executeCommand(command)
    }
    
    suspend fun sendInput(inputCommand: String, deviceSerial: String? = null): CommandResult = withContext(Dispatchers.IO) {
        val deviceCommand = if (deviceSerial != null) "-s $deviceSerial" else ""
        val command = "$deviceCommand shell input $inputCommand"
        executeCommand(command)
    }
    
    data class DeviceInfo(
        val serial: String,
        val status: String,
        val model: String = "",
        val device: String = "",
        val transportId: String = ""
    )
}