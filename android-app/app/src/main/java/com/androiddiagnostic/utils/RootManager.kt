package com.androiddiagnostic.utils

import android.content.Context
import android.util.Log
import com.androiddiagnostic.services.CommandExecutorService.CommandResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader

class RootManager(private val context: Context) {
    
    companion object {
        private const val TAG = "RootManager"
        private var isRootAvailable: Boolean? = null
    }
    
    suspend fun hasRoot(): Boolean = withContext(Dispatchers.IO) {
        if (isRootAvailable != null) {
            return@withContext isRootAvailable!!
        }
        
        isRootAvailable = checkRootAccess()
        isRootAvailable!!
    }
    
    private fun checkRootAccess(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("su")
            val os = DataOutputStream(process.outputStream)
            os.writeBytes("echo root\n")
            os.writeBytes("exit\n")
            os.flush()
            
            val exitValue = process.waitFor()
            exitValue == 0
        } catch (e: Exception) {
            Log.e(TAG, "Root check failed", e)
            false
        }
    }
    
    suspend fun executeRootCommand(command: String): CommandResult = withContext(Dispatchers.IO) {
        if (!hasRoot()) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "Root access not available"
            )
        }
        
        try {
            val process = Runtime.getRuntime().exec("su")
            val os = DataOutputStream(process.outputStream)
            val output = StringBuilder()
            val error = StringBuilder()
            
            // Execute command
            os.writeBytes("$command\n")
            os.writeBytes("exit\n")
            os.flush()
            
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
            os.close()
            
            CommandResult(
                success = exitCode == 0,
                output = output.toString(),
                error = if (exitCode != 0) error.toString() else null
            )
        } catch (e: Exception) {
            Log.e(TAG, "Root command execution failed", e)
            CommandResult(
                success = false,
                output = "",
                error = e.message ?: "Root command execution failed"
            )
        }
    }
    
    suspend fun remountSystem(readWrite: Boolean): Boolean = withContext(Dispatchers.IO) {
        if (!hasRoot()) {
            return@withContext false
        }
        
        val mode = if (readWrite) "rw" else "ro"
        val result = executeRootCommand("mount -o remount,$mode /system")
        result.success
    }
    
    suspend fun installSystemApp(apkPath: String): CommandResult = withContext(Dispatchers.IO) {
        if (!hasRoot()) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "Root access required"
            )
        }
        
        executeRootCommand("pm install -r $apkPath")
    }
    
    suspend fun uninstallSystemApp(packageName: String): CommandResult = withContext(Dispatchers.IO) {
        if (!hasRoot()) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "Root access required"
            )
        }
        
        executeRootCommand("pm uninstall $packageName")
    }
    
    suspend fun changeFilePermissions(path: String, permissions: String): CommandResult = withContext(Dispatchers.IO) {
        if (!hasRoot()) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "Root access required"
            )
        }
        
        executeRootCommand("chmod $permissions $path")
    }
    
    suspend fun killProcess(pid: Int): CommandResult = withContext(Dispatchers.IO) {
        if (!hasRoot()) {
            return@withContext CommandResult(
                success = false,
                output = "",
                error = "Root access required"
            )
        }
        
        executeRootCommand("kill -9 $pid")
    }
}