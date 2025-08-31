package com.androiddiagnostic.agent.data.models

data class DeviceMetrics(
    val timestamp: Long,
    val cpu: Float,
    val memory: Float,
    val battery: Int,
    val storage: Float,
    val network: String,
    val temperature: Float,
    val processes: Int,
    val uptime: Long,
    val systemInfo: SystemInfo? = null
)

data class SystemInfo(
    val model: String,
    val manufacturer: String,
    val androidVersion: String,
    val sdkVersion: Int,
    val kernelVersion: String? = null,
    val buildNumber: String? = null,
    val hardware: String? = null,
    val board: String? = null,
    val device: String? = null,
    val product: String? = null,
    val brand: String? = null,
    val display: String? = null,
    val fingerprint: String? = null,
    val tags: String? = null,
    val type: String? = null,
    val user: String? = null,
    val radioVersion: String? = null,
    val bootloader: String? = null,
    val isRooted: Boolean = false,
    val hasAdb: Boolean = false
)

data class Command(
    var id: String = "",
    val type: String,
    val payload: String,
    val status: String = "pending",
    val createdAt: Long = System.currentTimeMillis(),
    val deviceId: String = "",
    val userId: String = "",
    val priority: Int = 0
)
