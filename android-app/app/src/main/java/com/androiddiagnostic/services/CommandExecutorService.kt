package com.androiddiagnostic.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.androiddiagnostic.models.Command
import com.androiddiagnostic.utils.FirebaseManager
import com.androiddiagnostic.utils.RootManager
import com.androiddiagnostic.utils.ADBManager
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class CommandExecutorService : Service() {
    
    companion object {
        private const val TAG = "CommandExecutorService"
        private const val MAX_CONCURRENT_COMMANDS = 4
        private const val COMMAND_TIMEOUT_DEFAULT = 30000L // 30 seconds
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val executorPool = Executors.newFixedThreadPool(MAX_CONCURRENT_COMMANDS)
    private lateinit var firebaseManager: FirebaseManager
    private lateinit var rootManager: RootManager
    private lateinit var adbManager: ADBManager
    
    private var commandListener: ListenerRegistration? = null
    private val activeCommands = ConcurrentHashMap<String, Job>()
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        
        initializeComponents()
        startListeningForCommands()
    }
    
    private fun initializeComponents() {
        firebaseManager = FirebaseManager()
        rootManager = RootManager(this)
        adbManager = ADBManager(this)
    }
    
    private fun startListeningForCommands() {
        val deviceId = firebaseManager.getDeviceId()
        
        commandListener = firebaseManager.getFirestore()
            .collection("commands")
            .whereEqualTo("deviceId", deviceId)
            .whereEqualTo("status", "pending")
            .orderBy("priority", Query.Direction.DESCENDING)
            .orderBy("createdAt", Query.Direction.ASCENDING)
            .addSnapshotListener { snapshots, error ->
                if (error != null) {
                    Log.e(TAG, "Command listener error", error)
                    return@addSnapshotListener
                }
                
                snapshots?.documentChanges?.forEach { change ->
                    when (change.type) {
                        DocumentChange.Type.ADDED -> {
                            val command = change.document.toObject(Command::class.java)
                            executeCommand(command)
                        }
                        DocumentChange.Type.MODIFIED -> {
                            val command = change.document.toObject(Command::class.java)
                            if (command.status == "cancelled") {
                                cancelCommand(command.commandId)
                            }
                        }
                        DocumentChange.Type.REMOVED -> {
                            // Command was removed
                        }
                    }
                }
            }
    }
    
    private fun executeCommand(command: Command) {
        if (activeCommands.containsKey(command.commandId)) {
            Log.w(TAG, "Command ${command.commandId} is already executing")
            return
        }
        
        val job = serviceScope.launch {
            try {
                // Update command status to executing
                firebaseManager.updateCommandStatus(
                    command.commandId,
                    "executing",
                    startedAt = System.currentTimeMillis()
                )
                
                // Execute based on command type
                val result = withTimeout(command.timeout) {
                    when (command.type) {
                        "shell" -> executeShellCommand(command)
                        "adb" -> executeADBCommand(command)
                        "system" -> executeSystemCommand(command)
                        "custom" -> executeCustomCommand(command)
                        else -> CommandResult(
                            success = false,
                            output = "",
                            error = "Unknown command type: ${command.type}"
                        )
                    }
                }
                
                // Update command with result
                if (result.success) {
                    firebaseManager.updateCommandStatus(
                        command.commandId,
                        "completed",
                        result = result.output,
                        completedAt = System.currentTimeMillis()
                    )
                } else {
                    firebaseManager.updateCommandStatus(
                        command.commandId,
                        "failed",
                        error = result.error,
                        completedAt = System.currentTimeMillis()
                    )
                }
                
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Command ${command.commandId} timed out", e)
                firebaseManager.updateCommandStatus(
                    command.commandId,
                    "timeout",
                    error = "Command execution timed out after ${command.timeout}ms",
                    completedAt = System.currentTimeMillis()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Command ${command.commandId} failed", e)
                firebaseManager.updateCommandStatus(
                    command.commandId,
                    "failed",
                    error = e.message ?: "Unknown error",
                    completedAt = System.currentTimeMillis()
                )
            } finally {
                activeCommands.remove(command.commandId)
            }
        }
        
        activeCommands[command.commandId] = job
    }
    
    private fun cancelCommand(commandId: String) {
        activeCommands[commandId]?.cancel()
        activeCommands.remove(commandId)
        Log.d(TAG, "Cancelled command: $commandId")
    }
    
    private suspend fun executeShellCommand(command: Command): CommandResult = withContext(Dispatchers.IO) {
        try {
            // Check if command is whitelisted
            if (!isCommandSafe(command.command)) {
                return@withContext CommandResult(
                    success = false,
                    output = "",
                    error = "Command not allowed for security reasons"
                )
            }
            
            val process = Runtime.getRuntime().exec(command.command)
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
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Shell command execution failed"
            )
        }
    }
    
    private suspend fun executeADBCommand(command: Command): CommandResult = withContext(Dispatchers.IO) {
        if (!adbManager.isADBAvailable()) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "ADB is not available on this device"
            )
        }
        
        adbManager.executeCommand(command.command)
    }
    
    private suspend fun executeSystemCommand(command: Command): CommandResult = withContext(Dispatchers.IO) {
        when (command.command) {
            "reboot" -> {
                if (rootManager.hasRoot()) {
                    rootManager.executeRootCommand("reboot")
                } else {
                    CommandResult(
                        success = false,
                        output = "",
                        error = "Root access required for system commands"
                    )
                }
            }
            "screenshot" -> captureScreenshot()
            "clear_cache" -> clearAppCache()
            "force_stop" -> {
                val packageName = command.parameters["package"] as? String
                if (packageName != null) {
                    forceStopApp(packageName)
                } else {
                    CommandResult(
                        success = false,
                        output = "",
                        error = "Package name required"
                    )
                }
            }
            else -> CommandResult(
                success = false,
                output = "",
                error = "Unknown system command: ${command.command}"
            )
        }
    }
    
    private suspend fun executeCustomCommand(command: Command): CommandResult = withContext(Dispatchers.IO) {
        // Handle custom commands based on parameters
        when (command.parameters["action"]) {
            "collect_logs" -> collectLogs(command.parameters)
            "run_diagnostic" -> runDiagnostic(command.parameters)
            "export_data" -> exportData(command.parameters)
            else -> CommandResult(
                success = false,
                output = "",
                error = "Unknown custom action"
            )
        }
    }
    
    private fun isCommandSafe(command: String): Boolean {
        // Whitelist of safe commands
        val safeCommands = listOf(
            "ls", "cat", "echo", "pwd", "date", "uptime",
            "ps", "top", "df", "du", "free", "netstat",
            "ping", "ifconfig", "getprop", "dumpsys",
            "logcat", "pm list", "am start"
        )
        
        // Block dangerous commands
        val dangerousPatterns = listOf(
            "rm -rf", "dd if=", "mkfs", "format",
            "> /dev/", "sudo", "su -c", "chmod 777",
            "wget", "curl", "nc ", "telnet"
        )
        
        val lowerCommand = command.toLowerCase().trim()
        
        // Check for dangerous patterns
        for (pattern in dangerousPatterns) {
            if (lowerCommand.contains(pattern)) {
                return false
            }
        }
        
        // Check if command starts with a safe command
        for (safe in safeCommands) {
            if (lowerCommand.startsWith(safe)) {
                return true
            }
        }
        
        return false
    }
    
    private suspend fun captureScreenshot(): CommandResult = withContext(Dispatchers.IO) {
        try {
            val timestamp = System.currentTimeMillis()
            val filename = "/sdcard/Pictures/screenshot_$timestamp.png"
            
            val process = Runtime.getRuntime().exec("screencap -p $filename")
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                // Upload screenshot to Firebase Storage
                firebaseManager.uploadFile(filename, "screenshots")
                
                CommandResult(
                    success = true,
                    output = "Screenshot saved to $filename",
                    error = null
                )
            } else {
                CommandResult(
                    success = false,
                    output = "",
                    error = "Failed to capture screenshot"
                )
            }
        } catch (e: Exception) {
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Screenshot capture failed"
            )
        }
    }
    
    private suspend fun clearAppCache(): CommandResult = withContext(Dispatchers.IO) {
        try {
            val cacheDir = applicationContext.cacheDir
            val externalCacheDir = applicationContext.externalCacheDir
            
            var clearedSize = 0L
            
            cacheDir?.let {
                clearedSize += deleteRecursive(it)
            }
            
            externalCacheDir?.let {
                clearedSize += deleteRecursive(it)
            }
            
            CommandResult(
                success = true,
                output = "Cleared ${clearedSize / 1024}KB of cache",
                error = null
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Failed to clear cache"
            )
        }
    }
    
    private fun deleteRecursive(file: java.io.File): Long {
        var size = 0L
        if (file.isDirectory) {
            file.listFiles()?.forEach {
                size += deleteRecursive(it)
            }
        }
        size += file.length()
        file.delete()
        return size
    }
    
    private suspend fun forceStopApp(packageName: String): CommandResult = withContext(Dispatchers.IO) {
        try {
            val process = Runtime.getRuntime().exec("am force-stop $packageName")
            val exitCode = process.waitFor()
            
            CommandResult(
                success = exitCode == 0,
                output = "Force stopped $packageName",
                error = if (exitCode != 0) "Failed to force stop app" else null
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Failed to force stop app"
            )
        }
    }
    
    private suspend fun collectLogs(parameters: Map<String, Any>): CommandResult = withContext(Dispatchers.IO) {
        try {
            val logType = parameters["type"] as? String ?: "all"
            val duration = parameters["duration"] as? Int ?: 60 // seconds
            
            val command = when (logType) {
                "logcat" -> "logcat -d -t ${duration}s"
                "kernel" -> "dmesg"
                "system" -> "dumpsys"
                else -> "logcat -d"
            }
            
            val process = Runtime.getRuntime().exec(command)
            val output = process.inputStream.bufferedReader().readText()
            
            // Upload logs to Firebase Storage
            val filename = "logs_${System.currentTimeMillis()}.txt"
            firebaseManager.uploadText(output, filename, "logs")
            
            CommandResult(
                success = true,
                output = "Logs collected and uploaded: $filename",
                error = null
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Failed to collect logs"
            )
        }
    }
    
    private suspend fun runDiagnostic(parameters: Map<String, Any>): CommandResult = withContext(Dispatchers.IO) {
        // Run comprehensive diagnostic
        val diagnosticType = parameters["type"] as? String ?: "basic"
        
        val results = mutableMapOf<String, Any>()
        
        try {
            when (diagnosticType) {
                "network" -> {
                    results["ping_google"] = Runtime.getRuntime().exec("ping -c 4 8.8.8.8").waitFor() == 0
                    results["dns_test"] = Runtime.getRuntime().exec("nslookup google.com").waitFor() == 0
                    results["route_table"] = Runtime.getRuntime().exec("ip route").inputStream.bufferedReader().readText()
                }
                "storage" -> {
                    results["df_output"] = Runtime.getRuntime().exec("df -h").inputStream.bufferedReader().readText()
                    results["mount_points"] = Runtime.getRuntime().exec("mount").inputStream.bufferedReader().readText()
                }
                "performance" -> {
                    results["cpu_info"] = Runtime.getRuntime().exec("cat /proc/cpuinfo").inputStream.bufferedReader().readText()
                    results["memory_info"] = Runtime.getRuntime().exec("cat /proc/meminfo").inputStream.bufferedReader().readText()
                    results["load_average"] = Runtime.getRuntime().exec("cat /proc/loadavg").inputStream.bufferedReader().readText()
                }
                else -> {
                    results["basic_info"] = "Basic diagnostic completed"
                }
            }
            
            CommandResult(
                success = true,
                output = results.toString(),
                error = null
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Diagnostic failed"
            )
        }
    }
    
    private suspend fun exportData(parameters: Map<String, Any>): CommandResult = withContext(Dispatchers.IO) {
        // Export data based on parameters
        CommandResult(
            success = true,
            output = "Data export not yet implemented",
            error = null
        )
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service onDestroy")
        
        // Cancel all active commands
        activeCommands.values.forEach { it.cancel() }
        activeCommands.clear()
        
        // Remove command listener
        commandListener?.remove()
        
        // Cancel service scope
        serviceScope.cancel()
        
        // Shutdown executor pool
        executorPool.shutdown()
    }
    
    data class CommandResult(
        val success: Boolean,
        val output: String,
        val error: String?
    )
}