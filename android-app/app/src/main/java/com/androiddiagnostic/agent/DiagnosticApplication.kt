package com.androiddiagnostic.agent

import android.app.Application
import androidx.work.*
import com.androiddiagnostic.agent.workers.DataSyncWorker
import com.androiddiagnostic.agent.workers.MetricsCollectionWorker
import com.google.firebase.FirebaseApp
import com.google.firebase.crashlytics.FirebaseCrashlytics
import java.util.concurrent.TimeUnit

class DiagnosticApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Firebase
        FirebaseApp.initializeApp(this)
        
        // Setup Crashlytics
        FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(true)
        
        // Setup WorkManager for periodic tasks
        setupWorkManager()
    }
    
    private fun setupWorkManager() {
        // Configure WorkManager
        val config = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
        
        WorkManager.initialize(this, config)
        
        // Schedule periodic metrics collection
        scheduleMetricsCollection()
        
        // Schedule periodic data sync
        scheduleDataSync()
    }
    
    private fun scheduleMetricsCollection() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
            .setRequiresBatteryNotLow(false)
            .build()
        
        val metricsRequest = PeriodicWorkRequestBuilder<MetricsCollectionWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .addTag("metrics_collection")
            .build()
        
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork(
                "metrics_collection",
                ExistingPeriodicWorkPolicy.KEEP,
                metricsRequest
            )
    }
    
    private fun scheduleDataSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        
        val syncRequest = PeriodicWorkRequestBuilder<DataSyncWorker>(
            30, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .addTag("data_sync")
            .build()
        
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork(
                "data_sync",
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest
            )
    }
}
