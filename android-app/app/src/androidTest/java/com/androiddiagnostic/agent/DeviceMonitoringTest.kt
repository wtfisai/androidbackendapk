package com.androiddiagnostic.agent

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.androiddiagnostic.agent.services.DeviceMonitorService
import com.androiddiagnostic.agent.utils.SystemInfoCollector
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.*

@RunWith(AndroidJUnit4::class)
class DeviceMonitoringTest {
    
    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        android.Manifest.permission.INTERNET,
        android.Manifest.permission.ACCESS_NETWORK_STATE,
        android.Manifest.permission.ACCESS_WIFI_STATE
    )
    
    private lateinit var context: android.content.Context
    private lateinit var firestore: FirebaseFirestore
    private lateinit var auth: FirebaseAuth
    
    @Before
    fun setup() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        FirebaseApp.initializeApp(context)
        firestore = FirebaseFirestore.getInstance()
        auth = FirebaseAuth.getInstance()
    }
    
    @Test
    fun testSystemInfoCollection() {
        val systemInfo = SystemInfoCollector.getSystemInfo(context)
        
        assertNotNull(systemInfo)
        assertNotNull(systemInfo.model)
        assertNotNull(systemInfo.manufacturer)
        assertNotNull(systemInfo.androidVersion)
        assertTrue(systemInfo.sdkVersion > 0)
    }
    
    @Test
    fun testMetricsCollection() {
        val collector = SystemInfoCollector
        
        // Test CPU metrics
        val cpuUsage = collector.getCpuUsage()
        assertTrue(cpuUsage >= 0 && cpuUsage <= 100)
        
        // Test memory metrics
        val memoryInfo = collector.getMemoryInfo(context)
        assertTrue(memoryInfo.totalMemory > 0)
        assertTrue(memoryInfo.availableMemory >= 0)
        assertTrue(memoryInfo.usedMemory >= 0)
        
        // Test battery metrics
        val batteryInfo = collector.getBatteryInfo(context)
        assertTrue(batteryInfo.level >= 0 && batteryInfo.level <= 100)
        assertNotNull(batteryInfo.charging)
        
        // Test storage metrics
        val storageInfo = collector.getStorageInfo()
        assertTrue(storageInfo.totalStorage > 0)
        assertTrue(storageInfo.freeStorage >= 0)
        assertTrue(storageInfo.usedStorage >= 0)
    }
    
    @Test
    fun testNetworkConnectivity() {
        val isConnected = SystemInfoCollector.isNetworkAvailable(context)
        assertNotNull(isConnected)
        
        val networkType = SystemInfoCollector.getNetworkType(context)
        assertNotNull(networkType)
    }
    
    @Test
    fun testDeviceRegistration() = runBlocking {
        // Sign in anonymously for testing
        val authResult = auth.signInAnonymously().await()
        assertNotNull(authResult.user)
        
        val userId = authResult.user?.uid ?: return@runBlocking
        val deviceId = "test-device-${System.currentTimeMillis()}"
        
        val deviceData = hashMapOf(
            "userId" to userId,
            "name" to "Test Device",
            "model" to android.os.Build.MODEL,
            "manufacturer" to android.os.Build.MANUFACTURER,
            "androidVersion" to android.os.Build.VERSION.RELEASE,
            "appVersion" to "1.0.0-test",
            "capabilities" to hashMapOf(
                "root" to false,
                "adb" to false,
                "accessibility" to true
            ),
            "status" to "online",
            "lastSeen" to com.google.firebase.firestore.FieldValue.serverTimestamp()
        )
        
        firestore.collection("devices")
            .document(deviceId)
            .set(deviceData)
            .await()
        
        // Verify device was registered
        val doc = firestore.collection("devices")
            .document(deviceId)
            .get()
            .await()
        
        assertTrue(doc.exists())
        assertEquals("Test Device", doc.getString("name"))
        assertEquals(userId, doc.getString("userId"))
        
        // Clean up
        firestore.collection("devices").document(deviceId).delete().await()
        auth.currentUser?.delete()?.await()
    }
    
    @Test
    fun testMetricsSyncToFirestore() = runBlocking {
        // Sign in anonymously
        val authResult = auth.signInAnonymously().await()
        val userId = authResult.user?.uid ?: return@runBlocking
        val deviceId = "test-device-${System.currentTimeMillis()}"
        
        // Create test metrics
        val metrics = hashMapOf(
            "deviceId" to deviceId,
            "userId" to userId,
            "timestamp" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
            "cpu" to hashMapOf(
                "usage" to 45.5,
                "cores" to Runtime.getRuntime().availableProcessors(),
                "frequency" to 2400
            ),
            "memory" to hashMapOf(
                "total" to 8192,
                "used" to 4096,
                "free" to 4096,
                "percentage" to 50.0
            ),
            "battery" to hashMapOf(
                "level" to 75,
                "charging" to false,
                "temperature" to 32.0
            )
        )
        
        // Add metrics to Firestore
        val docRef = firestore.collection("device_metrics")
            .add(metrics)
            .await()
        
        assertNotNull(docRef.id)
        
        // Verify metrics were saved
        val doc = docRef.get().await()
        assertTrue(doc.exists())
        assertEquals(deviceId, doc.getString("deviceId"))
        assertEquals(userId, doc.getString("userId"))
        
        // Clean up
        docRef.delete().await()
        auth.currentUser?.delete()?.await()
    }
}
