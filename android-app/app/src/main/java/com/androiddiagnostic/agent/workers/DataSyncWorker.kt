package com.androiddiagnostic.agent.workers

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.androiddiagnostic.agent.data.repository.MetricsRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DataSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    private val metricsRepository = MetricsRepository(context)
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            // Check if user is authenticated
            val user = auth.currentUser ?: return@withContext Result.failure()
            
            // Get device ID
            val deviceId = getDeviceId()
            if (deviceId.isEmpty()) return@withContext Result.failure()
            
            // Get unsynced metrics
            val unsyncedMetrics = metricsRepository.getUnsyncedMetrics()
            
            if (unsyncedMetrics.isNotEmpty()) {
                // Batch upload to Firebase
                val batch = firestore.batch()
                val syncedIds = mutableListOf<Long>()
                
                unsyncedMetrics.forEach { metrics ->
                    // Add to activities collection
                    val activityRef = firestore.collection("activities").document()
                    batch.set(activityRef, mapOf(
                        "deviceId" to deviceId,
                        "userId" to user.uid,
                        "type" to "metrics",
                        "timestamp" to metrics.timestamp,
                        "data" to mapOf(
                            "cpu" to metrics.cpu,
                            "memory" to metrics.memory,
                            "battery" to metrics.battery,
                            "storage" to metrics.storage,
                            "network" to metrics.network,
                            "temperature" to metrics.temperature,
                            "processes" to metrics.processes,
                            "uptime" to metrics.uptime,
                            "systemInfo" to metrics.systemInfo
                        )
                    ))
                }
                
                // Update device document with latest metrics
                val latestMetrics = unsyncedMetrics.maxByOrNull { it.timestamp }
                latestMetrics?.let {
                    val deviceRef = firestore.collection("devices").document(deviceId)
                    batch.update(deviceRef, mapOf(
                        "metrics" to mapOf(
                            "cpu" to it.cpu,
                            "memory" to it.memory,
                            "battery" to it.battery,
                            "storage" to it.storage,
                            "network" to it.network,
                            "temperature" to it.temperature,
                            "processes" to it.processes,
                            "uptime" to it.uptime
                        ),
                        "lastSeen" to System.currentTimeMillis(),
                        "status" to "online"
                    ))
                }
                
                // Commit batch
                batch.commit().addOnSuccessListener {
                    // Mark metrics as synced in local database
                    // Note: In a real implementation, you'd track the IDs properly
                }.addOnFailureListener { e ->
                    e.printStackTrace()
                }
            }
            
            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }
    
    private fun getDeviceId(): String {
        val sharedPrefs = applicationContext.getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
        return sharedPrefs.getString("device_id", "") ?: ""
    }
}
