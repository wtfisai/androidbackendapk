package com.androiddiagnostic.agent.utils

import android.content.Context
import com.androiddiagnostic.agent.services.CommandResult
import java.io.BufferedReader
import java.io.InputStreamReader

class AdbManager(private val context: Context) {
    
    private var hasAdb: Boolean? = null
    
    fun isAdbAvailable(): Boolean {
        if (hasAdb != null) {
            return hasAdb!!
        }
        
        hasAdb = checkAdb()
        return hasAdb!!
    }
    
    private fun checkAdb(): Boolean {
        return try {
            android.provider.Settings.Global.getInt(
                context.contentResolver,
                android.provider.Settings.Global.ADB_ENABLED
            ) == 1
        } catch (e: Exception) {
            false
        }
    }
    
    fun executeCommand(command: String): CommandResult {
        if (!isAdbAvailable()) {
            return CommandResult(
                success = false,
                error = "ADB is not enabled"
            )
        }
        
        return try {
            // Try to execute via shell with ADB permissions
            val fullCommand = "sh -c '$command'"
            val process = Runtime.getRuntime().exec(fullCommand)
            
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
                error = "Failed to execute ADB command: ${e.message}"
            )
        }
    }
    
    fun getDeviceProperties(): Map<String, String> {
        val properties = mutableMapOf<String, String>()
        
        val propCommands = listOf(
            "ro.product.model",
            "ro.product.manufacturer",
            "ro.build.version.release",
            "ro.build.version.sdk",
            "ro.serialno",
            "ro.bootloader",
            "ro.hardware",
            "ro.build.fingerprint"
        )
        
        propCommands.forEach { prop ->
            val result = executeCommand("getprop $prop")
            if (result.success && !result.output.isNullOrBlank()) {
                properties[prop] = result.output
            }
        }
        
        return properties
    }
}
