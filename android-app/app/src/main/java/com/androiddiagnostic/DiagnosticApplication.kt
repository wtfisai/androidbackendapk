package com.androiddiagnostic

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.work.Configuration
import androidx.work.WorkManager
import com.androiddiagnostic.utils.FirebaseManager
import com.androiddiagnostic.workers.DataSyncWorker
import com.google.firebase.FirebaseApp

class DiagnosticApplication : Application() {
    
    companion object {
        const val NOTIFICATION_CHANNEL_ID = "diagnostic_monitoring"
        const val NOTIFICATION_CHANNEL_ALERTS = "diagnostic_alerts"
        const val NOTIFICATION_CHANNEL_COMMANDS = "diagnostic_commands"
        
        lateinit var instance: DiagnosticApplication
            private set
    }
    
    lateinit var firebaseManager: FirebaseManager
        private set
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        
        // Initialize Firebase
        FirebaseApp.initializeApp(this)
        firebaseManager = FirebaseManager()
        
        // Create notification channels
        createNotificationChannels()
        
        // Initialize WorkManager
        initializeWorkManager()
    }
    
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)
            
            // Monitoring channel
            val monitoringChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Device Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ongoing device monitoring service"
                setShowBadge(false)
            }
            
            // Alerts channel
            val alertsChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_ALERTS,
                "System Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Important system alerts and warnings"
                enableVibration(true)
                enableLights(true)
            }
            
            // Commands channel
            val commandsChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_COMMANDS,
                "Command Results",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Results from executed commands"
            }
            
            notificationManager.createNotificationChannels(
                listOf(monitoringChannel, alertsChannel, commandsChannel)
            )
        }
    }
    
    private fun initializeWorkManager() {
        val config = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
            
        WorkManager.initialize(this, config)
    }
}