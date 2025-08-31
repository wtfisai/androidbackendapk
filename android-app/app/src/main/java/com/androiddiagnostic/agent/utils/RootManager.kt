package com.androiddiagnostic.agent.utils

import android.content.Context
import com.androiddiagnostic.agent.services.CommandResult
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader

class RootManager(private val context: Context) {
    
    private var hasRoot: Boolean? = null
    private var rootProcess: Process? = null
    
    fun hasRootAccess(): Boolean {
        if (hasRoot != null) {
            return hasRoot!!
        }
        
        hasRoot = checkRoot()
        return hasRoot!!
    }
    
    private fun checkRoot(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("su")
            val outputStream = DataOutputStream(process.outputStream)
            outputStream.writeBytes("echo root\n")
            outputStream.writeBytes("exit\n")
            outputStream.flush()
            
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val output = reader.readLine()
            reader.close()
            
            process.waitFor()
            output == "root"
        } catch (e: Exception) {
            false
        }
    }
    
    fun executeCommand(command: String): CommandResult {
        if (!hasRootAccess()) {
            return CommandResult(
                success = false,
                error = "Root access not available"
            )
        }
        
        return try {
            val process = Runtime.getRuntime().exec("su")
            val outputStream = DataOutputStream(process.outputStream)
            
            // Execute command
            outputStream.writeBytes("$command\n")
            outputStream.writeBytes("exit\n")
            outputStream.flush()
            
            // Read output
            val outputReader = BufferedReader(InputStreamReader(process.inputStream))
            val errorReader = BufferedReader(InputStreamReader(process.errorStream))
            
            val output = StringBuilder()
            val error = StringBuilder()
            
            var line: String?
            while (outputReader.readLine().also { line = it } != null) {
                output.append(line).append("\n")
            }
            
            while (errorReader.readLine().also { line = it } != null) {
                error.append(line).append("\n")
            }
            
            outputReader.close()
            errorReader.close()
            
            val exitCode = process.waitFor()
            
            CommandResult(
                success = exitCode == 0,
                output = output.toString().trim(),
                error = if (error.isNotEmpty()) error.toString().trim() else null,
                exitCode = exitCode
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                error = "Failed to execute root command: ${e.message}"
            )
        }
    }
    
    fun executeCommandWithTimeout(command: String, timeoutMillis: Long = 10000): CommandResult {
        if (!hasRootAccess()) {
            return CommandResult(
                success = false,
                error = "Root access not available"
            )
        }
        
        return try {
            val process = Runtime.getRuntime().exec("su")
            val outputStream = DataOutputStream(process.outputStream)
            
            outputStream.writeBytes("$command\n")
            outputStream.writeBytes("exit\n")
            outputStream.flush()
            
            val finished = process.waitFor(timeoutMillis, java.util.concurrent.TimeUnit.MILLISECONDS)
            
            if (!finished) {
                process.destroyForcibly()
                return CommandResult(
                    success = false,
                    error = "Command timed out after ${timeoutMillis}ms"
                )
            }
            
            val outputReader = BufferedReader(InputStreamReader(process.inputStream))
            val output = outputReader.readText()
            outputReader.close()
            
            CommandResult(
                success = process.exitValue() == 0,
                output = output.trim(),
                exitCode = process.exitValue()
            )
        } catch (e: Exception) {
            CommandResult(
                success = false,
                error = "Failed to execute root command: ${e.message}"
            )
        }
    }
    
    fun grantPermission(packageName: String, permission: String): Boolean {
        val result = executeCommand("pm grant $packageName $permission")
        return result.success
    }
    
    fun revokePermission(packageName: String, permission: String): Boolean {
        val result = executeCommand("pm revoke $packageName $permission")
        return result.success
    }
    
    fun installApp(apkPath: String): Boolean {
        val result = executeCommand("pm install -r $apkPath")
        return result.success
    }
    
    fun uninstallApp(packageName: String): Boolean {
        val result = executeCommand("pm uninstall $packageName")
        return result.success
    }
    
    fun clearAppData(packageName: String): Boolean {
        val result = executeCommand("pm clear $packageName")
        return result.success
    }
    
    fun enableApp(packageName: String): Boolean {
        val result = executeCommand("pm enable $packageName")
        return result.success
    }
    
    fun disableApp(packageName: String): Boolean {
        val result = executeCommand("pm disable-user $packageName")
        return result.success
    }
    
    fun forceStopApp(packageName: String): Boolean {
        val result = executeCommand("am force-stop $packageName")
        return result.success
    }
    
    fun setSystemProperty(key: String, value: String): Boolean {
        val result = executeCommand("setprop $key $value")
        return result.success
    }
    
    fun getSystemProperty(key: String): String? {
        val result = executeCommand("getprop $key")
        return if (result.success) result.output else null
    }
    
    fun reboot(): Boolean {
        val result = executeCommand("reboot")
        return result.success
    }
    
    fun rebootRecovery(): Boolean {
        val result = executeCommand("reboot recovery")
        return result.success
    }
    
    fun rebootBootloader(): Boolean {
        val result = executeCommand("reboot bootloader")
        return result.success
    }
}
