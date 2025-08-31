package com.androiddiagnostic.agent.viewmodels

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.androiddiagnostic.agent.data.models.DeviceMetrics
import com.androiddiagnostic.agent.data.repository.MetricsRepository
import com.androiddiagnostic.agent.utils.SystemInfoCollector
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch

class MainViewModel(application: Application) : AndroidViewModel(application) {
    
    private val metricsRepository = MetricsRepository(application)
    private val systemInfoCollector = SystemInfoCollector(application)
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    
    private val _deviceStatus = MutableLiveData<DeviceStatus>()
    val deviceStatus: LiveData<DeviceStatus> = _deviceStatus
    
    private val _metrics = MutableLiveData<DeviceMetrics>()
    val metrics: LiveData<DeviceMetrics> = _metrics
    
    private val _commandCount = MutableLiveData<Int>()
    val commandCount: LiveData<Int> = _commandCount
    
    private val _alertCount = MutableLiveData<Int>()
    val alertCount: LiveData<Int> = _alertCount
    
    init {
        loadDeviceStatus()
        listenToCommands()
        listenToAlerts()
    }
    
    fun updateDeviceStatus() {
        viewModelScope.launch {
            try {
                val status = DeviceStatus(
                    isOnline = systemInfoCollector.isNetworkAvailable(),
                    isWifi = systemInfoCollector.isWifiConnected(),
                    isRooted = checkRootAccess(),
                    hasAdb = checkAdbEnabled(),
                    batteryLevel = getBatteryLevel(),
                    lastSync = System.currentTimeMillis()
                )
                
                _deviceStatus.postValue(status)
                
                // Update Firebase
                updateFirebaseStatus(status)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    private fun loadDeviceStatus() {
        updateDeviceStatus()
    }
    
    private fun listenToCommands() {
        auth.currentUser?.let { user ->
            val deviceId = getDeviceId()
            
            firestore.collection("commands")
                .whereEqualTo("deviceId", deviceId)
                .whereEqualTo("status", "pending")
                .addSnapshotListener { snapshot, error ->
                    if (error != null) {
                        error.printStackTrace()
                        return@addSnapshotListener
                    }
                    
                    _commandCount.postValue(snapshot?.size() ?: 0)
                }
        }
    }
    
    private fun listenToAlerts() {
        auth.currentUser?.let { user ->
            val deviceId = getDeviceId()
            
            firestore.collection("alerts")
                .whereEqualTo("deviceId", deviceId)
                .whereEqualTo("status", "active")
                .addSnapshotListener { snapshot, error ->
                    if (error != null) {
                        error.printStackTrace()
                        return@addSnapshotListener
                    }
                    
                    _alertCount.postValue(snapshot?.size() ?: 0)
                }
        }
    }
    
    private suspend fun updateFirebaseStatus(status: DeviceStatus) {
        val deviceId = getDeviceId()
        
        firestore.collection("devices")
            .document(deviceId)
            .update(
                mapOf(
                    "status" to if (status.isOnline) "online" else "offline",
                    "lastSeen" to System.currentTimeMillis(),
                    "battery" to status.batteryLevel,
                    "network" to if (status.isWifi) "wifi" else "mobile",
                    "capabilities" to mapOf(
                        "root" to status.isRooted,
                        "adb" to status.hasAdb
                    )
                )
            )
            .addOnFailureListener { e ->
                e.printStackTrace()
            }
    }
    
    private fun checkRootAccess(): Boolean {
        return try {
            Runtime.getRuntime().exec("su").destroy()
            true
        } catch (e: Exception) {
            false
        }
    }
    
    private fun checkAdbEnabled(): Boolean {
        return try {
            android.provider.Settings.Global.getInt(
                getApplication<Application>().contentResolver,
                android.provider.Settings.Global.ADB_ENABLED
            ) == 1
        } catch (e: Exception) {
            false
        }
    }
    
    private fun getBatteryLevel(): Int {
        return try {
            val batteryManager = getApplication<Application>()
                .getSystemService(android.content.Context.BATTERY_SERVICE) as android.os.BatteryManager
            batteryManager.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            100
        }
    }
    
    private fun getDeviceId(): String {
        val sharedPrefs = getApplication<Application>()
            .getSharedPreferences("device_prefs", android.content.Context.MODE_PRIVATE)
        return sharedPrefs.getString("device_id", "") ?: ""
    }
    
    data class DeviceStatus(
        val isOnline: Boolean,
        val isWifi: Boolean,
        val isRooted: Boolean,
        val hasAdb: Boolean,
        val batteryLevel: Int,
        val lastSync: Long
    )
}
