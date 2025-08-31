package com.androiddiagnostic.agent

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.androiddiagnostic.agent.databinding.ActivityLoginBinding
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class LoginActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityLoginBinding
    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()
        
        // Check if already logged in
        if (auth.currentUser != null) {
            navigateToMain()
            return
        }
        
        setupClickListeners()
    }
    
    private fun setupClickListeners() {
        binding.btnLogin.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            val password = binding.etPassword.text.toString()
            
            if (validateInput(email, password)) {
                performLogin(email, password)
            }
        }
        
        binding.btnRegister.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            val password = binding.etPassword.text.toString()
            
            if (validateInput(email, password)) {
                performRegistration(email, password)
            }
        }
        
        binding.tvForgotPassword.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            if (email.isNotEmpty()) {
                resetPassword(email)
            } else {
                Toast.makeText(this, "Please enter your email", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun validateInput(email: String, password: String): Boolean {
        if (email.isEmpty()) {
            binding.etEmail.error = "Email is required"
            return false
        }
        
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            binding.etEmail.error = "Invalid email format"
            return false
        }
        
        if (password.isEmpty()) {
            binding.etPassword.error = "Password is required"
            return false
        }
        
        if (password.length < 6) {
            binding.etPassword.error = "Password must be at least 6 characters"
            return false
        }
        
        return true
    }
    
    private fun performLogin(email: String, password: String) {
        binding.btnLogin.isEnabled = false
        binding.btnRegister.isEnabled = false
        
        auth.signInWithEmailAndPassword(email, password)
            .addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    // Login successful
                    registerDevice()
                } else {
                    // Login failed
                    Toast.makeText(
                        this,
                        "Login failed: ${task.exception?.message}",
                        Toast.LENGTH_LONG
                    ).show()
                    binding.btnLogin.isEnabled = true
                    binding.btnRegister.isEnabled = true
                }
            }
    }
    
    private fun performRegistration(email: String, password: String) {
        binding.btnLogin.isEnabled = false
        binding.btnRegister.isEnabled = false
        
        auth.createUserWithEmailAndPassword(email, password)
            .addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    // Registration successful
                    createUserProfile()
                } else {
                    // Registration failed
                    Toast.makeText(
                        this,
                        "Registration failed: ${task.exception?.message}",
                        Toast.LENGTH_LONG
                    ).show()
                    binding.btnLogin.isEnabled = true
                    binding.btnRegister.isEnabled = true
                }
            }
    }
    
    private fun resetPassword(email: String) {
        auth.sendPasswordResetEmail(email)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    Toast.makeText(
                        this,
                        "Password reset email sent",
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    Toast.makeText(
                        this,
                        "Failed to send reset email: ${task.exception?.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
    }
    
    private fun createUserProfile() {
        val user = auth.currentUser ?: return
        
        val userProfile = hashMapOf(
            "email" to user.email,
            "createdAt" to System.currentTimeMillis(),
            "subscription" to "free",
            "deviceLimit" to 1,
            "settings" to hashMapOf(
                "notifications" to true,
                "alertsEnabled" to true,
                "syncInterval" to 30
            )
        )
        
        firestore.collection("users")
            .document(user.uid)
            .set(userProfile)
            .addOnSuccessListener {
                registerDevice()
            }
            .addOnFailureListener { e ->
                Toast.makeText(
                    this,
                    "Failed to create profile: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
            }
    }
    
    private fun registerDevice() {
        val user = auth.currentUser ?: return
        val deviceId = getDeviceId()
        
        val deviceInfo = hashMapOf(
            "userId" to user.uid,
            "name" to "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
            "model" to android.os.Build.MODEL,
            "manufacturer" to android.os.Build.MANUFACTURER,
            "androidVersion" to android.os.Build.VERSION.RELEASE,
            "sdkVersion" to android.os.Build.VERSION.SDK_INT,
            "registeredAt" to System.currentTimeMillis(),
            "lastSeen" to System.currentTimeMillis(),
            "status" to "online",
            "capabilities" to getDeviceCapabilities()
        )
        
        firestore.collection("devices")
            .document(deviceId)
            .set(deviceInfo)
            .addOnSuccessListener {
                navigateToMain()
            }
            .addOnFailureListener { e ->
                Toast.makeText(
                    this,
                    "Failed to register device: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                navigateToMain() // Navigate anyway
            }
    }
    
    private fun getDeviceCapabilities(): Map<String, Boolean> {
        return mapOf(
            "root" to checkRootAccess(),
            "adb" to checkAdbEnabled(),
            "accessibility" to false, // Will be enabled later
            "usageStats" to false, // Will be enabled later
            "deviceAdmin" to false // Will be enabled later
        )
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
                contentResolver,
                android.provider.Settings.Global.ADB_ENABLED
            ) == 1
        } catch (e: Exception) {
            false
        }
    }
    
    private fun getDeviceId(): String {
        val sharedPrefs = getSharedPreferences("device_prefs", MODE_PRIVATE)
        var deviceId = sharedPrefs.getString("device_id", null)
        
        if (deviceId == null) {
            deviceId = "${android.os.Build.MANUFACTURER}_${android.os.Build.MODEL}_${System.currentTimeMillis()}"
                .replace(" ", "_")
                .replace("/", "_")
            
            sharedPrefs.edit().putString("device_id", deviceId).apply()
        }
        
        return deviceId
    }
    
    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
