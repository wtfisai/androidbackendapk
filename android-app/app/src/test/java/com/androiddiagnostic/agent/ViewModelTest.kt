package com.androiddiagnostic.agent

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.androiddiagnostic.agent.viewmodels.MainViewModel
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runBlockingTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@ExperimentalCoroutinesApi
@RunWith(MockitoJUnitRunner::class)
class ViewModelTest {
    
    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()
    
    @Mock
    private lateinit var mockAuth: FirebaseAuth
    
    @Mock
    private lateinit var mockFirestore: FirebaseFirestore
    
    private lateinit var viewModel: MainViewModel
    
    @Before
    fun setup() {
        viewModel = MainViewModel()
    }
    
    @Test
    fun `test device status updates`() {
        // Test initial state
        assertNotNull(viewModel.deviceStatus.value)
        assertEquals("unknown", viewModel.deviceStatus.value)
        
        // Update status
        viewModel.updateDeviceStatus("online")
        assertEquals("online", viewModel.deviceStatus.value)
        
        viewModel.updateDeviceStatus("offline")
        assertEquals("offline", viewModel.deviceStatus.value)
    }
    
    @Test
    fun `test metrics update`() {
        val testMetrics = mapOf(
            "cpu" to 45.5,
            "memory" to 60.0,
            "battery" to 75,
            "storage" to 50.0
        )
        
        viewModel.updateMetrics(testMetrics)
        
        assertNotNull(viewModel.currentMetrics.value)
        assertEquals(45.5, viewModel.currentMetrics.value?.get("cpu"))
        assertEquals(60.0, viewModel.currentMetrics.value?.get("memory"))
    }
    
    @Test
    fun `test command count updates`() {
        assertEquals(0, viewModel.pendingCommands.value)
        
        viewModel.updateCommandCount(5)
        assertEquals(5, viewModel.pendingCommands.value)
        
        viewModel.updateCommandCount(3)
        assertEquals(3, viewModel.pendingCommands.value)
    }
    
    @Test
    fun `test alert count updates`() {
        assertEquals(0, viewModel.activeAlerts.value)
        
        viewModel.updateAlertCount(2)
        assertEquals(2, viewModel.activeAlerts.value)
        
        viewModel.updateAlertCount(0)
        assertEquals(0, viewModel.activeAlerts.value)
    }
    
    @Test
    fun `test error handling`() {
        viewModel.setError("Test error message")
        assertNotNull(viewModel.errorMessage.value)
        assertEquals("Test error message", viewModel.errorMessage.value)
        
        viewModel.clearError()
        assertEquals(null, viewModel.errorMessage.value)
    }
    
    @Test
    fun `test loading state`() {
        assertEquals(false, viewModel.isLoading.value)
        
        viewModel.setLoading(true)
        assertEquals(true, viewModel.isLoading.value)
        
        viewModel.setLoading(false)
        assertEquals(false, viewModel.isLoading.value)
    }
}
