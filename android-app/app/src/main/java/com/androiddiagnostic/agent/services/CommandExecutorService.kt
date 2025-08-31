package com.androiddiagnostic.agent.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.androiddiagnostic.agent.data.models.Command
import com.androiddiagnostic.agent.data.models.CommandResult
import com.androiddiagnostic.agent.utils.RootManager
import com.androiddiagnostic.agent.utils.AdbManager
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.*
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import java.net.URI
import java.util.concurrent.LinkedBlockingQueue

class CommandExecutorService : Service() {
    
    companion object {
        const val WEBSOCKET_URL = "wss://your-firebase-project.web.app/ws"
        const val MAX_RETRY_ATTEMPTS = 5
        const val RETRY_DELAY = 5000L
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var firestore: FirebaseFirestore
    private lateinit var auth: FirebaseAuth
    private lateinit var rootManager: RootManager
    private lateinit var adbManager: AdbManager
    
    private var commandListener: ListenerRegistration? = null
    private var webSocketClient: WebSocketClient? = null
    private val commandQueue = LinkedBlockingQueue<Command>()
    private var executorJob: Job? = null
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Firebase
        firestore = FirebaseFirestore.getInstance()
        auth = FirebaseAuth.getInstance()
        
        // Initialize managers
        rootManager = RootManager(applicationContext)
        adbManager = AdbManager(applicationContext)
        
        // Start command listener
        startCommandListener()
        
        // Start command executor
        startCommandExecutor()
        
        // Initialize WebSocket connection
        initWebSocket()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        commandListener?.remove()
        webSocketClient?.close()
        executorJob?.cancel()
        serviceScope.cancel()
    }
    
    private fun startCommandListener() {
        auth.currentUser?.let { user ->
            val deviceId = getDeviceId()
            
            commandListener = firestore.collection("commands")
                .whereEqualTo("deviceId", deviceId)
                .whereEqualTo("status", "pending")
                .addSnapshotListener { snapshots, error ->
                    if (error != null) {
                        error.printStackTrace()
                        return@addSnapshotListener
                    }
                    
                    snapshots?.documents?.forEach { doc ->
                        val command = doc.toObject(Command::class.java)?.apply {
                            id = doc.id
                        }
                        command?.let {
                            commandQueue.offer(it)
                            updateCommandStatus(it.id, "processing")
                        }
                    }
                }
        }
    }
    
    private fun startCommandExecutor() {
        executorJob = serviceScope.launch {
            while (isActive) {
                try {
                    val command = commandQueue.take()
                    executeCommand(command)
                } catch (e: InterruptedException) {
                    break
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }
    
    private suspend fun executeCommand(command: Command) {
        withContext(Dispatchers.IO) {
            val result = when (command.type) {
                "shell" -> executeShellCommand(command.payload)
                "adb" -> executeAdbCommand(command.payload)
                "root" -> executeRootCommand(command.payload)
                "app_list" -> getInstalledApps()
                "app_info" -> getAppInfo(command.payload)
                "app_uninstall" -> uninstallApp(command.payload)
                "app_force_stop" -> forceStopApp(command.payload)
                "app_clear_cache" -> clearAppCache(command.payload)
                "permission_grant" -> grantPermission(command.payload)
                "permission_revoke" -> revokePermission(command.payload)
                "process_list" -> getProcessList()
                "process_kill" -> killProcess(command.payload)
                "network_info" -> getNetworkInfo()
                "storage_info" -> getStorageInfo()
                "battery_info" -> getBatteryInfo()
                "system_info" -> getSystemInfo()
                else -> CommandResult(
                    success = false,
                    output = null,
                    error = "Unknown command type: ${command.type}"
                )
            }
            
            // Update command with result
            updateCommandResult(command.id, result)
        }
    }
    
    private fun executeShellCommand(payload: String): CommandResult {
        return try {
            val process = Runtime.getRuntime().exec(payload)
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            CommandResult(
                success = exitCode == 0,
                output = output,
                error = if (error.isNotEmpty()) error else null,
                exitCode = exitCode
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                output = null,
                error = e.message
            )
        }
    }
    
    private fun executeAdbCommand(payload: String): CommandResult {
        return if (adbManager.isAdbAvailable()) {
            adbManager.executeCommand(payload)
        } else {
            CommandResult(
                success = false,
                output = null,
                error = "ADB not available"
            )
        }
    }
    
    private fun executeRootCommand(payload: String): CommandResult {
        return if (rootManager.hasRootAccess()) {
            rootManager.executeCommand(payload)
        } else {
            CommandResult(
                success = false,
                output = null,
                error = "Root access not available"
            )
        }
    }
    
    private fun getInstalledApps(): CommandResult {
        return try {
            val pm = packageManager
            val packages = pm.getInstalledPackages(0)
            val appList = packages.map { packageInfo ->
                mapOf(
                    "packageName" to packageInfo.packageName,
                    "appName" to packageInfo.applicationInfo.loadLabel(pm).toString(),
                    "versionName" to packageInfo.versionName,
                    "versionCode" to packageInfo.versionCode,
                    "isSystemApp" to ((packageInfo.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0)
                )
            }
            
            CommandResult(
                success = true,
                output = appList.toString(),
                data = appList
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                error = e.message
            )
        }
    }
    
    private fun getAppInfo(packageName: String): CommandResult {
        return try {
            val pm = packageManager
            val packageInfo = pm.getPackageInfo(packageName, 0)
            val appInfo = mapOf(
                "packageName" to packageInfo.packageName,
                "appName" to packageInfo.applicationInfo.loadLabel(pm).toString(),
                "versionName" to packageInfo.versionName,
                "versionCode" to packageInfo.versionCode,
                "firstInstallTime" to packageInfo.firstInstallTime,
                "lastUpdateTime" to packageInfo.lastUpdateTime,
                "dataDir" to packageInfo.applicationInfo.dataDir,
                "sourceDir" to packageInfo.applicationInfo.sourceDir,
                "permissions" to packageInfo.requestedPermissions?.toList()
            )
            
            CommandResult(
                success = true,
                output = appInfo.toString(),
                data = appInfo
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                error = e.message
            )
        }
    }
    
    private fun uninstallApp(packageName: String): CommandResult {
        return if (rootManager.hasRootAccess()) {
            rootManager.executeCommand("pm uninstall $packageName")
        } else {
            CommandResult(
                success = false,
                error = "Root access required for app uninstall"
            )
        }
    }
    
    private fun forceStopApp(packageName: String): CommandResult {
        return executeShellCommand("am force-stop $packageName")
    }
    
    private fun clearAppCache(packageName: String): CommandResult {
        return if (rootManager.hasRootAccess()) {
            rootManager.executeCommand("pm clear $packageName")
        } else {
            CommandResult(
                success = false,
                error = "Root access required to clear app cache"
            )
        }
    }
    
    private fun grantPermission(payload: String): CommandResult {
        val parts = payload.split(" ")
        if (parts.size != 2) {
            return CommandResult(
                success = false,
                error = "Invalid payload format. Expected: <packageName> <permission>"
            )
        }
        
        val packageName = parts[0]
        val permission = parts[1]
        
        return if (rootManager.hasRootAccess()) {
            rootManager.executeCommand("pm grant $packageName $permission")
        } else {
            CommandResult(
                success = false,
                error = "Root access required to grant permissions"
            )
        }
    }
    
    private fun revokePermission(payload: String): CommandResult {
        val parts = payload.split(" ")
        if (parts.size != 2) {
            return CommandResult(
                success = false,
                error = "Invalid payload format. Expected: <packageName> <permission>"
            )
        }
        
        val packageName = parts[0]
        val permission = parts[1]
        
        return if (rootManager.hasRootAccess()) {
            rootManager.executeCommand("pm revoke $packageName $permission")
        } else {
            CommandResult(
                success = false,
                error = "Root access required to revoke permissions"
            )
        }
    }
    
    private fun getProcessList(): CommandResult {
        return executeShellCommand("ps -A")
    }
    
    private fun killProcess(pid: String): CommandResult {
        return executeShellCommand("kill -9 $pid")
    }
    
    private fun getNetworkInfo(): CommandResult {
        return executeShellCommand("ip addr show")
    }
    
    private fun getStorageInfo(): CommandResult {
        return executeShellCommand("df -h")
    }
    
    private fun getBatteryInfo(): CommandResult {
        return executeShellCommand("dumpsys battery")
    }
    
    private fun getSystemInfo(): CommandResult {
        val commands = listOf(
            "getprop ro.product.model",
            "getprop ro.build.version.release",
            "getprop ro.build.version.sdk",
            "cat /proc/cpuinfo",
            "cat /proc/meminfo"
        )
        
        val results = commands.map { cmd ->
            executeShellCommand(cmd)
        }
        
        return CommandResult(
            success = results.all { it.success },
            output = results.mapNotNull { it.output }.joinToString("\n"),
            data = results
        )
    }
    
    private fun initWebSocket() {
        val uri = URI(WEBSOCKET_URL)
        
        webSocketClient = object : WebSocketClient(uri) {
            override fun onOpen(handshakedata: ServerHandshake?) {
                // Connected to WebSocket
                send("""{"type": "register", "deviceId": "${getDeviceId()}"}""")
            }
            
            override fun onMessage(message: String?) {
                message?.let {
                    // Parse and handle WebSocket commands
                    handleWebSocketMessage(it)
                }
            }
            
            override fun onClose(code: Int, reason: String?, remote: Boolean) {
                // Reconnect after delay
                serviceScope.launch {
                    delay(RETRY_DELAY)
                    initWebSocket()
                }
            }
            
            override fun onError(ex: Exception?) {
                ex?.printStackTrace()
            }
        }
        
        webSocketClient?.connect()
    }
    
    private fun handleWebSocketMessage(message: String) {
        // Parse JSON message and add to command queue
        try {
            // Parse command from WebSocket message
            // Add to commandQueue for processing
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    private fun updateCommandStatus(commandId: String, status: String) {
        firestore.collection("commands")
            .document(commandId)
            .update("status", status)
    }
    
    private fun updateCommandResult(commandId: String, result: CommandResult) {
        firestore.collection("commands")
            .document(commandId)
            .update(
                mapOf(
                    "status" to if (result.success) "completed" else "failed",
                    "result" to result.toMap(),
                    "completedAt" to System.currentTimeMillis()
                )
            )
    }
    
    private fun getDeviceId(): String {
        val sharedPrefs = getSharedPreferences("device_prefs", android.content.Context.MODE_PRIVATE)
        return sharedPrefs.getString("device_id", "") ?: ""
    }
}

data class CommandResult(
    val success: Boolean,
    val output: String? = null,
    val error: String? = null,
    val exitCode: Int? = null,
    val data: Any? = null
) {
    fun toMap(): Map<String, Any?> {
        return mapOf(
            "success" to success,
            "output" to output,
            "error" to error,
            "exitCode" to exitCode,
            "data" to data
        )
    }
}
