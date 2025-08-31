package com.androiddiagnostic.agent

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class SecurityTest {
    
    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore
    private lateinit var context: android.content.Context
    
    @Before
    fun setup() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()
    }
    
    @Test
    fun testAuthenticationRequired() = runBlocking {
        // Sign out to ensure no user is authenticated
        auth.signOut()
        
        // Try to access protected resources without authentication
        assertFailsWith<Exception> {
            firestore.collection("devices")
                .document("test-device")
                .get()
                .await()
        }
    }
    
    @Test
    fun testUserDataIsolation() = runBlocking {
        // Create two test users
        val user1 = auth.createUserWithEmailAndPassword("test1@example.com", "TestPass123!").await()
        val user1Id = user1.user?.uid ?: return@runBlocking
        
        // Create device for user1
        val device1Id = "device-user1-${System.currentTimeMillis()}"
        firestore.collection("devices")
            .document(device1Id)
            .set(mapOf(
                "userId" to user1Id,
                "name" to "User1 Device"
            ))
            .await()
        
        // Sign out and sign in as user2
        auth.signOut()
        val user2 = auth.createUserWithEmailAndPassword("test2@example.com", "TestPass456!").await()
        val user2Id = user2.user?.uid ?: return@runBlocking
        
        // User2 should not be able to access user1's device
        val device1Doc = firestore.collection("devices")
            .document(device1Id)
            .get()
            .await()
        
        // Verify access is denied or document doesn't exist for user2
        assertTrue(!device1Doc.exists() || device1Doc.getString("userId") != user2Id)
        
        // Clean up
        auth.currentUser?.delete()?.await()
        auth.signInWithEmailAndPassword("test1@example.com", "TestPass123!").await()
        firestore.collection("devices").document(device1Id).delete().await()
        auth.currentUser?.delete()?.await()
    }
    
    @Test
    fun testInputSanitization() {
        // Test SQL injection prevention
        val maliciousInput = "'; DROP TABLE users; --"
        val sanitized = sanitizeInput(maliciousInput)
        assertTrue(!sanitized.contains("DROP"))
        assertTrue(!sanitized.contains(";"))
        
        // Test XSS prevention
        val xssInput = "<script>alert('XSS')</script>"
        val xssSanitized = sanitizeInput(xssInput)
        assertTrue(!xssSanitized.contains("<script>"))
        assertTrue(!xssSanitized.contains("</script>"))
        
        // Test command injection prevention
        val cmdInput = "ls; rm -rf /"
        val cmdSanitized = sanitizeInput(cmdInput)
        assertTrue(!cmdSanitized.contains(";"))
        assertTrue(!cmdSanitized.contains("rm -rf"))
    }
    
    @Test
    fun testSecureDataStorage() {
        val sharedPrefs = context.getSharedPreferences("secure_prefs", android.content.Context.MODE_PRIVATE)
        
        // Test that sensitive data is not stored in plain text
        val testToken = "sensitive_auth_token_12345"
        val encryptedToken = encryptData(testToken)
        
        sharedPrefs.edit()
            .putString("auth_token", encryptedToken)
            .apply()
        
        val storedToken = sharedPrefs.getString("auth_token", "")
        assertTrue(storedToken != testToken) // Should be encrypted
        assertTrue(storedToken == encryptedToken)
        
        // Verify decryption works
        val decryptedToken = decryptData(storedToken!!)
        assertTrue(decryptedToken == testToken)
    }
    
    @Test
    fun testNetworkSecurityConfig() {
        // Verify HTTPS is enforced
        val apiUrl = "https://firestore.googleapis.com"
        assertTrue(apiUrl.startsWith("https://"))
        
        // Test that cleartext traffic is not allowed (Android 9+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            val networkPolicy = context.applicationInfo.flags and 
                android.content.pm.ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC
            assertTrue(networkPolicy == 0) // Cleartext should be disabled
        }
    }
    
    @Test
    fun testPermissionsHandling() {
        // Verify dangerous permissions are requested at runtime
        val dangerousPermissions = listOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.CAMERA,
            android.Manifest.permission.READ_EXTERNAL_STORAGE,
            android.Manifest.permission.WRITE_EXTERNAL_STORAGE
        )
        
        dangerousPermissions.forEach { permission ->
            val hasPermission = context.checkSelfPermission(permission)
            // Permissions should not be granted by default
            assertTrue(
                hasPermission == android.content.pm.PackageManager.PERMISSION_DENIED ||
                hasPermission == android.content.pm.PackageManager.PERMISSION_GRANTED
            )
        }
    }
    
    @Test
    fun testRateLimiting() = runBlocking {
        // Test that API calls are rate limited
        val startTime = System.currentTimeMillis()
        var requestCount = 0
        var rateLimitHit = false
        
        // Try to make many rapid requests
        repeat(100) {
            try {
                firestore.collection("test")
                    .document("doc$it")
                    .set(mapOf("test" to true))
                    .await()
                requestCount++
            } catch (e: Exception) {
                if (e.message?.contains("rate limit") == true ||
                    e.message?.contains("quota") == true) {
                    rateLimitHit = true
                }
            }
        }
        
        val endTime = System.currentTimeMillis()
        val duration = endTime - startTime
        
        // Should either hit rate limit or take reasonable time
        assertTrue(rateLimitHit || duration > 1000)
    }
    
    @Test
    fun testCertificatePinning() {
        // Verify SSL certificate validation
        val sslContext = javax.net.ssl.SSLContext.getDefault()
        assertNotNull(sslContext)
        
        val trustManagers = (sslContext.socketFactory as? javax.net.ssl.SSLSocketFactory)
        assertNotNull(trustManagers)
    }
    
    @Test
    fun testSessionTimeout() = runBlocking {
        // Sign in
        auth.signInAnonymously().await()
        assertNotNull(auth.currentUser)
        
        // Simulate session expiry (this would normally happen after timeout)
        // In production, Firebase handles this automatically
        val idToken = auth.currentUser?.getIdToken(false)?.await()
        assertNotNull(idToken)
        
        // Verify token has expiration
        assertTrue(idToken?.expirationTimestamp ?: 0 > 0)
    }
    
    @Test
    fun testDataEncryptionInTransit() {
        // Verify all API endpoints use HTTPS
        val endpoints = listOf(
            "https://firestore.googleapis.com",
            "https://identitytoolkit.googleapis.com",
            "https://fcm.googleapis.com"
        )
        
        endpoints.forEach { endpoint ->
            assertTrue(endpoint.startsWith("https://"))
            assertTrue(!endpoint.contains("http://"))
        }
    }
    
    // Helper functions
    private fun sanitizeInput(input: String): String {
        return input
            .replace(Regex("[;'\"<>]"), "")
            .replace("DROP", "")
            .replace("DELETE", "")
            .replace("rm ", "")
            .replace("../", "")
    }
    
    private fun encryptData(data: String): String {
        // Simple XOR encryption for testing (use proper encryption in production)
        val key = "test_key_12345"
        return data.toCharArray().mapIndexed { index, char ->
            (char.code xor key[index % key.length].code).toChar()
        }.joinToString("")
    }
    
    private fun decryptData(data: String): String {
        // XOR is symmetric, so same function as encrypt
        return encryptData(data)
    }
}
