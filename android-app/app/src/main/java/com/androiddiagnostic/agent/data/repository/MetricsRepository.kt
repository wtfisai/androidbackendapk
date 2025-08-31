package com.androiddiagnostic.agent.data.repository

import android.content.Context
import androidx.room.*
import com.androiddiagnostic.agent.data.models.DeviceMetrics
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow

@Database(entities = [MetricsEntity::class], version = 1, exportSchema = false)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun metricsDao(): MetricsDao
    
    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "metrics_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}

@Entity(tableName = "metrics")
data class MetricsEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val timestamp: Long,
    val cpu: Float,
    val memory: Float,
    val battery: Int,
    val storage: Float,
    val network: String,
    val temperature: Float,
    val processes: Int,
    val uptime: Long,
    val systemInfoJson: String?,
    val synced: Boolean = false
)

@Dao
interface MetricsDao {
    @Query("SELECT * FROM metrics ORDER BY timestamp DESC LIMIT :limit")
    fun getLatestMetrics(limit: Int): Flow<List<MetricsEntity>>
    
    @Query("SELECT * FROM metrics WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsyncedMetrics(): List<MetricsEntity>
    
    @Insert
    suspend fun insert(metrics: MetricsEntity)
    
    @Update
    suspend fun update(metrics: MetricsEntity)
    
    @Query("UPDATE metrics SET synced = 1 WHERE id IN (:ids)")
    suspend fun markAsSynced(ids: List<Long>)
    
    @Query("DELETE FROM metrics WHERE timestamp < :timestamp")
    suspend fun deleteOldMetrics(timestamp: Long)
}

class Converters {
    private val gson = Gson()
    
    @TypeConverter
    fun fromSystemInfo(systemInfo: com.androiddiagnostic.agent.data.models.SystemInfo?): String? {
        return systemInfo?.let { gson.toJson(it) }
    }
    
    @TypeConverter
    fun toSystemInfo(json: String?): com.androiddiagnostic.agent.data.models.SystemInfo? {
        return json?.let { gson.fromJson(it, com.androiddiagnostic.agent.data.models.SystemInfo::class.java) }
    }
}

class MetricsRepository(private val context: Context) {
    private val database = AppDatabase.getDatabase(context)
    private val metricsDao = database.metricsDao()
    private val gson = Gson()
    
    suspend fun saveMetrics(metrics: DeviceMetrics) {
        val entity = MetricsEntity(
            timestamp = metrics.timestamp,
            cpu = metrics.cpu,
            memory = metrics.memory,
            battery = metrics.battery,
            storage = metrics.storage,
            network = metrics.network,
            temperature = metrics.temperature,
            processes = metrics.processes,
            uptime = metrics.uptime,
            systemInfoJson = metrics.systemInfo?.let { gson.toJson(it) },
            synced = false
        )
        metricsDao.insert(entity)
    }
    
    fun getLatestMetrics(limit: Int = 100): Flow<List<MetricsEntity>> {
        return metricsDao.getLatestMetrics(limit)
    }
    
    suspend fun getUnsyncedMetrics(): List<DeviceMetrics> {
        val entities = metricsDao.getUnsyncedMetrics()
        return entities.map { entity ->
            DeviceMetrics(
                timestamp = entity.timestamp,
                cpu = entity.cpu,
                memory = entity.memory,
                battery = entity.battery,
                storage = entity.storage,
                network = entity.network,
                temperature = entity.temperature,
                processes = entity.processes,
                uptime = entity.uptime,
                systemInfo = entity.systemInfoJson?.let { 
                    gson.fromJson(it, com.androiddiagnostic.agent.data.models.SystemInfo::class.java)
                }
            )
        }
    }
    
    suspend fun markMetricsAsSynced(ids: List<Long>) {
        metricsDao.markAsSynced(ids)
    }
    
    suspend fun cleanupOldMetrics(daysToKeep: Int = 7) {
        val cutoffTime = System.currentTimeMillis() - (daysToKeep * 24 * 60 * 60 * 1000L)
        metricsDao.deleteOldMetrics(cutoffTime)
    }
}
