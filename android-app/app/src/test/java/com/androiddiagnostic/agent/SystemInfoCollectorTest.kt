package com.androiddiagnostic.agent

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.androiddiagnostic.agent.utils.SystemInfoCollector
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class SystemInfoCollectorTest {
    
    private lateinit var context: Context
    
    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
    }
    
    @Test
    fun `test CPU usage collection`() {
        val cpuUsage = SystemInfoCollector.getCpuUsage()
        assertNotNull(cpuUsage)
        assertTrue(cpuUsage >= 0.0)
        assertTrue(cpuUsage <= 100.0)
    }
    
    @Test
    fun `test memory info collection`() {
        val memoryInfo = SystemInfoCollector.getMemoryInfo(context)
        assertNotNull(memoryInfo)
        assertTrue(memoryInfo.totalMemory > 0)
        assertTrue(memoryInfo.availableMemory >= 0)
        assertTrue(memoryInfo.usedMemory >= 0)
        assertTrue(memoryInfo.usedMemory <= memoryInfo.totalMemory)
    }
    
    @Test
    fun `test battery info collection`() {
        val batteryInfo = SystemInfoCollector.getBatteryInfo(context)
        assertNotNull(batteryInfo)
        assertTrue(batteryInfo.level >= 0)
        assertTrue(batteryInfo.level <= 100)
        assertNotNull(batteryInfo.charging)
        assertTrue(batteryInfo.temperature >= -50)
        assertTrue(batteryInfo.temperature <= 100)
    }
    
    @Test
    fun `test storage info collection`() {
        val storageInfo = SystemInfoCollector.getStorageInfo()
        assertNotNull(storageInfo)
        assertTrue(storageInfo.totalStorage > 0)
        assertTrue(storageInfo.freeStorage >= 0)
        assertTrue(storageInfo.usedStorage >= 0)
        assertTrue(storageInfo.usedStorage <= storageInfo.totalStorage)
    }
    
    @Test
    fun `test network connectivity check`() {
        val isConnected = SystemInfoCollector.isNetworkAvailable(context)
        assertNotNull(isConnected)
        // Can be true or false depending on test environment
    }
    
    @Test
    fun `test network type detection`() {
        val networkType = SystemInfoCollector.getNetworkType(context)
        assertNotNull(networkType)
        assertTrue(networkType in listOf("wifi", "mobile", "none", "other"))
    }
    
    @Test
    fun `test system info collection`() {
        val systemInfo = SystemInfoCollector.getSystemInfo(context)
        assertNotNull(systemInfo)
        assertNotNull(systemInfo.model)
        assertNotNull(systemInfo.manufacturer)
        assertNotNull(systemInfo.androidVersion)
        assertTrue(systemInfo.sdkVersion >= 30) // Android 11+
        assertNotNull(systemInfo.deviceId)
    }
    
    @Test
    fun `test process info collection`() {
        val processes = SystemInfoCollector.getRunningProcesses(context)
        assertNotNull(processes)
        assertTrue(processes.isNotEmpty())
        
        processes.forEach { process ->
            assertNotNull(process.name)
            assertTrue(process.pid > 0)
            assertTrue(process.memory >= 0)
        }
    }
    
    @Test
    fun `test temperature monitoring`() {
        val temperature = SystemInfoCollector.getDeviceTemperature(context)
        assertNotNull(temperature)
        // Temperature can be null if sensor not available
        temperature?.let {
            assertTrue(it >= -50)
            assertTrue(it <= 100)
        }
    }
}
