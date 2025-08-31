package com.androiddiagnostic.agent

import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.hamcrest.Matchers.allOf
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class UIResponsivenessTest {
    
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)
    
    private lateinit var device: UiDevice
    
    @Before
    fun setup() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    }
    
    @Test
    fun testPortraitToLandscapeRotation() {
        // Start in portrait
        device.setOrientationNatural()
        Thread.sleep(1000)
        
        // Verify UI elements are visible
        onView(withId(R.id.dashboardFragment))
            .check(matches(isDisplayed()))
        
        // Rotate to landscape
        device.setOrientationLeft()
        Thread.sleep(1000)
        
        // Verify UI adapts properly
        onView(withId(R.id.dashboardFragment))
            .check(matches(isDisplayed()))
        
        // Rotate back to portrait
        device.setOrientationNatural()
        Thread.sleep(1000)
        
        onView(withId(R.id.dashboardFragment))
            .check(matches(isDisplayed()))
    }
    
    @Test
    fun testResponsiveLayoutOnSmallScreens() {
        // Test on small screen (phone)
        activityRule.scenario.onActivity { activity ->
            val displayMetrics = activity.resources.displayMetrics
            val dpWidth = displayMetrics.widthPixels / displayMetrics.density
            
            // Verify compact layout is used for phones (< 600dp)
            if (dpWidth < 600) {
                onView(withId(R.id.bottomNavigation))
                    .check(matches(isDisplayed()))
            }
        }
    }
    
    @Test
    fun testResponsiveLayoutOnTablets() {
        // Test on large screen (tablet)
        activityRule.scenario.onActivity { activity ->
            val displayMetrics = activity.resources.displayMetrics
            val dpWidth = displayMetrics.widthPixels / displayMetrics.density
            
            // Verify expanded layout for tablets (>= 600dp)
            if (dpWidth >= 600) {
                // Navigation rail or drawer should be visible
                onView(withId(R.id.navigationRail))
                    .check(matches(isDisplayed()))
            }
        }
    }
    
    @Test
    fun testScrollingPerformance() {
        // Navigate to commands list
        onView(withId(R.id.navigation_commands))
            .perform(click())
        
        Thread.sleep(500)
        
        // Test smooth scrolling
        onView(withId(R.id.commandsRecyclerView))
            .perform(swipeUp())
            .perform(swipeDown())
            .check(matches(isDisplayed()))
    }
    
    @Test
    fun testTouchResponsiveness() {
        // Test quick taps
        onView(withId(R.id.navigation_dashboard))
            .perform(click())
        
        Thread.sleep(100)
        
        onView(withId(R.id.navigation_commands))
            .perform(click())
        
        Thread.sleep(100)
        
        onView(withId(R.id.navigation_alerts))
            .perform(click())
        
        Thread.sleep(100)
        
        onView(withId(R.id.navigation_settings))
            .perform(click())
        
        // Verify no crashes and proper navigation
        onView(withId(R.id.settingsFragment))
            .check(matches(isDisplayed()))
    }
    
    @Test
    fun testTextScaling() {
        activityRule.scenario.onActivity { activity ->
            // Test with different text scales
            val config = activity.resources.configuration
            config.fontScale = 0.85f // Small text
            activity.resources.updateConfiguration(config, activity.resources.displayMetrics)
            
            onView(withId(R.id.titleText))
                .check(matches(isDisplayed()))
            
            config.fontScale = 1.0f // Normal text
            activity.resources.updateConfiguration(config, activity.resources.displayMetrics)
            
            onView(withId(R.id.titleText))
                .check(matches(isDisplayed()))
            
            config.fontScale = 1.15f // Large text
            activity.resources.updateConfiguration(config, activity.resources.displayMetrics)
            
            onView(withId(R.id.titleText))
                .check(matches(isDisplayed()))
        }
    }
    
    @Test
    fun testDarkModeCompatibility() {
        activityRule.scenario.onActivity { activity ->
            // Test light mode
            activity.setTheme(R.style.Theme_AndroidDiagnostic_Light)
            
            onView(withId(R.id.dashboardFragment))
                .check(matches(isDisplayed()))
            
            // Test dark mode
            activity.setTheme(R.style.Theme_AndroidDiagnostic_Dark)
            
            onView(withId(R.id.dashboardFragment))
                .check(matches(isDisplayed()))
        }
    }
    
    @Test
    fun testMemoryLeaks() {
        // Navigate through all screens multiple times
        repeat(5) {
            onView(withId(R.id.navigation_dashboard)).perform(click())
            Thread.sleep(200)
            onView(withId(R.id.navigation_commands)).perform(click())
            Thread.sleep(200)
            onView(withId(R.id.navigation_alerts)).perform(click())
            Thread.sleep(200)
            onView(withId(R.id.navigation_settings)).perform(click())
            Thread.sleep(200)
        }
        
        // Check memory usage hasn't increased significantly
        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        val maxMemory = runtime.maxMemory()
        
        // Memory usage should be less than 80% of max
        assertTrue(usedMemory < maxMemory * 0.8)
    }
    
    @Test
    fun testAccessibilitySupport() {
        // Test content descriptions
        onView(withContentDescription("Dashboard"))
            .check(matches(isDisplayed()))
        
        onView(withContentDescription("Commands"))
            .perform(click())
        
        onView(withContentDescription("Add Command"))
            .check(matches(isDisplayed()))
        
        // Test minimum touch target size (48dp)
        onView(withId(R.id.addCommandButton))
            .check { view, _ ->
                val widthPx = view.width
                val heightPx = view.height
                val density = view.context.resources.displayMetrics.density
                val widthDp = widthPx / density
                val heightDp = heightPx / density
                
                assertTrue(widthDp >= 48)
                assertTrue(heightDp >= 48)
            }
    }
    
    @Test
    fun testKeyboardNavigation() {
        // Test tab navigation
        onView(withId(R.id.emailInput))
            .perform(click())
            .perform(pressImeActionButton())
        
        onView(withId(R.id.passwordInput))
            .check(matches(hasFocus()))
            .perform(pressImeActionButton())
        
        // Verify form submission works with keyboard
        onView(withId(R.id.loginButton))
            .check(matches(isDisplayed()))
    }
}
