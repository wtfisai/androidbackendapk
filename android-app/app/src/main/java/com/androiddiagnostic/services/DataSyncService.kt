package com.androiddiagnostic.services

import android.app.Service
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.IBinder
import android.util.Log
import androidx.work.*
import com.androiddiagnostic.models.DeviceMetrics
import com.androiddiagnostic.utils.FirebaseManager
import com.androiddiagnostic.workers.DataSyncWorker
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.TimeUnit
import com.google.gson.Gson
import android.content.Context
import android.content.SharedPreferences

class DataSyncService : Service() {
    
    companion object {
        private const val TAG = "DataSyncService"
        private const val PREFS_NAME = "DataSyncPrefs"
        private const val KEY_SYNC_QUEUE = "sync_queue"
        private const val MAX_QUEUE_SIZE = 1000
        private const val BATCH_SIZE = 50
        private const val SYNC_INTERVAL_SECONDS = 60L
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var firebaseManager: FirebaseManager
    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var sharedPreferences: SharedPreferences
    private val gson = Gson()
    
    // Queue for offline data
    private val syncQueue = ConcurrentLinkedQueue<SyncItem>()
    private var isOnline = false
    private var syncJob: Job? = null
    
    // Network callback
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.d(TAG, "Network available")
            isOnline = true
            processSyncQueue()
        }
        
        override fun onLost(network: Network) {
            Log.d(TAG, "Network lost")
            isOnline = false
        }
        
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            isOnline = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        
        initializeComponents()
        loadQueueFromDisk()
        registerNetworkCallback()
        startPeriodicSync()
    }
    
    private fun initializeComponents() {
        firebaseManager = FirebaseManager()
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        // Check initial network state
        isOnline = isNetworkAvailable()
    }
    
    private fun isNetworkAvailable(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
    
    private fun registerNetworkCallback() {
        val networkRequest = android.net.NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
            
        connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
    }
    
    private fun loadQueueFromDisk() {
        try {
            val queueJson = sharedPreferences.getString(KEY_SYNC_QUEUE, null)
            if (!queueJson.isNullOrEmpty()) {
                val items = gson.fromJson(queueJson, Array<SyncItem>::class.java)
                syncQueue.addAll(items)
                Log.d(TAG, "Loaded ${items.size} items from disk")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load queue from disk", e)
        }
    }
    
    private fun saveQueueToDisk() {
        try {
            val items = syncQueue.toArray(arrayOf<SyncItem>())
            val queueJson = gson.toJson(items)
            sharedPreferences.edit()
                .putString(KEY_SYNC_QUEUE, queueJson)
                .apply()
            Log.d(TAG, "Saved ${items.size} items to disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save queue to disk", e)
        }
    }
    
    private fun startPeriodicSync() {
        syncJob = serviceScope.launch {
            while (isActive) {
                delay(SYNC_INTERVAL_SECONDS * 1000)
                if (isOnline) {
                    processSyncQueue()
                }
            }
        }
    }
    
    fun queueMetrics(metrics: DeviceMetrics) {
        queueData(SyncType.METRICS, metrics)
    }
    
    fun queueCommand(commandId: String, result: Map<String, Any>) {
        queueData(SyncType.COMMAND_RESULT, mapOf("commandId" to commandId, "result" to result))
    }
    
    fun queueActivity(activity: Map<String, Any>) {
        queueData(SyncType.ACTIVITY, activity)
    }
    
    fun queueAlert(alert: Map<String, Any>) {
        queueData(SyncType.ALERT, alert, priority = SyncPriority.HIGH)
    }
    
    private fun queueData(type: SyncType, data: Any, priority: SyncPriority = SyncPriority.NORMAL) {
        // Check queue size limit
        if (syncQueue.size >= MAX_QUEUE_SIZE) {
            // Remove oldest items if queue is full
            val toRemove = syncQueue.size - MAX_QUEUE_SIZE + 1
            repeat(toRemove) {
                syncQueue.poll()
            }
            Log.w(TAG, "Queue full, removed $toRemove old items")
        }
        
        val item = SyncItem(
            id = System.currentTimeMillis().toString(),
            type = type,
            data = data,
            timestamp = System.currentTimeMillis(),
            priority = priority,
            retryCount = 0
        )
        
        if (priority == SyncPriority.HIGH) {
            // For high priority, try to sync immediately if online
            syncQueue.offer(item)
            if (isOnline) {
                serviceScope.launch {
                    syncSingleItem(item)
                }
            }
        } else {
            syncQueue.offer(item)
        }
        
        // Save queue to disk periodically
        if (syncQueue.size % 10 == 0) {
            saveQueueToDisk()
        }
        
        // Process queue if online
        if (isOnline && syncQueue.size >= BATCH_SIZE) {
            processSyncQueue()
        }
    }
    
    private fun processSyncQueue() {
        if (syncQueue.isEmpty()) return
        
        serviceScope.launch {
            Log.d(TAG, "Processing sync queue with ${syncQueue.size} items")
            
            val batch = mutableListOf<SyncItem>()
            var processedCount = 0
            
            // Process items in batches
            while (syncQueue.isNotEmpty() && isOnline && processedCount < BATCH_SIZE) {
                val item = syncQueue.poll() ?: break
                batch.add(item)
                processedCount++
            }
            
            if (batch.isNotEmpty()) {
                val results = syncBatch(batch)
                
                // Re-queue failed items with increased retry count
                results.filterNot { it.success }.forEach { result ->
                    val item = result.item
                    if (item.retryCount < 3) {
                        item.retryCount++
                        syncQueue.offer(item)
                        Log.w(TAG, "Re-queuing failed item ${item.id}, retry ${item.retryCount}")
                    } else {
                        Log.e(TAG, "Dropping item ${item.id} after 3 retries")
                    }
                }
                
                // Save updated queue to disk
                saveQueueToDisk()
                
                Log.d(TAG, "Synced ${results.count { it.success }}/${batch.size} items")
            }
        }
    }
    
    private suspend fun syncBatch(items: List<SyncItem>): List<SyncResult> = withContext(Dispatchers.IO) {
        val results = mutableListOf<SyncResult>()
        
        // Group items by type for efficient batch processing
        val groupedItems = items.groupBy { it.type }
        
        for ((type, typeItems) in groupedItems) {
            when (type) {
                SyncType.METRICS -> {
                    typeItems.forEach { item ->
                        val result = syncMetrics(item.data as DeviceMetrics)
                        results.add(SyncResult(item, result))
                    }
                }
                SyncType.COMMAND_RESULT -> {
                    typeItems.forEach { item ->
                        val result = syncCommandResult(item.data as Map<String, Any>)
                        results.add(SyncResult(item, result))
                    }
                }
                SyncType.ACTIVITY -> {
                    val activities = typeItems.map { it.data as Map<String, Any> }
                    val result = syncActivities(activities)
                    typeItems.forEach { item ->
                        results.add(SyncResult(item, result))
                    }
                }
                SyncType.ALERT -> {
                    typeItems.forEach { item ->
                        val result = syncAlert(item.data as Map<String, Any>)
                        results.add(SyncResult(item, result))
                    }
                }
            }
        }
        
        results
    }
    
    private suspend fun syncSingleItem(item: SyncItem): Boolean = withContext(Dispatchers.IO) {
        try {
            when (item.type) {
                SyncType.METRICS -> syncMetrics(item.data as DeviceMetrics)
                SyncType.COMMAND_RESULT -> syncCommandResult(item.data as Map<String, Any>)
                SyncType.ACTIVITY -> syncActivities(listOf(item.data as Map<String, Any>))
                SyncType.ALERT -> syncAlert(item.data as Map<String, Any>)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync item ${item.id}", e)
            false
        }
    }
    
    private suspend fun syncMetrics(metrics: DeviceMetrics): Boolean = withContext(Dispatchers.IO) {
        try {
            firebaseManager.syncDeviceMetrics(metrics)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync metrics", e)
            false
        }
    }
    
    private suspend fun syncCommandResult(data: Map<String, Any>): Boolean = withContext(Dispatchers.IO) {
        try {
            val commandId = data["commandId"] as String
            val result = data["result"] as Map<String, Any>
            
            firebaseManager.updateCommandStatus(
                commandId = commandId,
                status = "completed",
                result = result.toString()
            )
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync command result", e)
            false
        }
    }
    
    private suspend fun syncActivities(activities: List<Map<String, Any>>): Boolean = withContext(Dispatchers.IO) {
        try {
            val batch = FirebaseFirestore.getInstance().batch()
            
            activities.forEach { activity ->
                val docRef = FirebaseFirestore.getInstance()
                    .collection("activities")
                    .document()
                batch.set(docRef, activity)
            }
            
            batch.commit().await()
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync activities", e)
            false
        }
    }
    
    private suspend fun syncAlert(alert: Map<String, Any>): Boolean = withContext(Dispatchers.IO) {
        try {
            FirebaseFirestore.getInstance()
                .collection("alerts")
                .add(alert)
                .await()
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync alert", e)
            false
        }
    }
    
    fun schedulePeriodicSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
            
        val syncRequest = PeriodicWorkRequestBuilder<DataSyncWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .addTag("DataSync")
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()
            
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "DataSync",
            ExistingPeriodicWorkPolicy.REPLACE,
            syncRequest
        )
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "SYNC_NOW" -> processSyncQueue()
            "CLEAR_QUEUE" -> clearQueue()
        }
        return START_STICKY
    }
    
    private fun clearQueue() {
        syncQueue.clear()
        saveQueueToDisk()
        Log.d(TAG, "Queue cleared")
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service onDestroy")
        
        // Save queue before destroying
        saveQueueToDisk()
        
        // Cleanup
        syncJob?.cancel()
        serviceScope.cancel()
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }
    
    // Data classes
    data class SyncItem(
        val id: String,
        val type: SyncType,
        val data: Any,
        val timestamp: Long,
        val priority: SyncPriority,
        var retryCount: Int
    )
    
    enum class SyncType {
        METRICS,
        COMMAND_RESULT,
        ACTIVITY,
        ALERT
    }
    
    enum class SyncPriority {
        LOW,
        NORMAL,
        HIGH
    }
    
    data class SyncResult(
        val item: SyncItem,
        val success: Boolean
    )
}

// Extension function for coroutine await
private suspend fun <T> com.google.android.gms.tasks.Task<T>.await(): T {
    return kotlinx.coroutines.tasks.await(this)
}