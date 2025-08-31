/**
 * Theme Manager for Android Diagnostic Dashboard
 * Handles light/dark mode switching with system preference detection
 */

class ThemeManager {
  constructor() {
    this.themes = {
      LIGHT: 'light',
      DARK: 'dark',
      SYSTEM: 'system'
    };

    this.storageKey = 'diagnostic-dashboard-theme';
    this.currentTheme = this.getStoredTheme();

    this.init();
  }

  init() {
    // Apply initial theme
    this.applyTheme(this.currentTheme);

    // Listen for system theme changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        if (this.currentTheme === this.themes.SYSTEM) {
          this.applySystemTheme();
        }
      });
    }

    // Update UI elements
    this.updateThemeToggle();
  }

  getStoredTheme() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored && Object.values(this.themes).includes(stored) ? stored : this.themes.SYSTEM;
    } catch (error) {
      console.warn('Cannot access localStorage, using system theme:', error);
      return this.themes.SYSTEM;
    }
  }

  setStoredTheme(theme) {
    try {
      localStorage.setItem(this.storageKey, theme);
    } catch (error) {
      console.warn('Cannot save theme to localStorage:', error);
    }
  }

  getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return this.themes.DARK;
    }
    return this.themes.LIGHT;
  }

  applyTheme(theme) {
    const html = document.documentElement;
    const body = document.body;

    // Remove existing theme classes
    html.removeAttribute('data-theme');
    body.classList.remove('theme-light', 'theme-dark');

    let actualTheme = theme;

    if (theme === this.themes.SYSTEM) {
      actualTheme = this.getSystemTheme();
    }

    // Apply theme
    html.setAttribute('data-theme', actualTheme);
    body.classList.add(`theme-${actualTheme}`);

    // Set color scheme for form controls
    html.style.colorScheme = actualTheme;

    this.currentTheme = theme;
    this.setStoredTheme(theme);

    // Dispatch theme change event
    window.dispatchEvent(
      new CustomEvent('themechange', {
        detail: {
          theme: actualTheme,
          userPreference: theme
        }
      })
    );

    // Update meta theme-color for mobile browsers
    this.updateMetaThemeColor(actualTheme);
  }

  applySystemTheme() {
    this.applyTheme(this.themes.SYSTEM);
  }

  updateMetaThemeColor(theme) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.name = 'theme-color';
      document.head.appendChild(metaThemeColor);
    }

    // Use CSS custom property values for theme color
    const colors = {
      light: '#ffffff',
      dark: '#0f0f23'
    };

    metaThemeColor.content = colors[theme] || colors.light;
  }

  toggleTheme() {
    const themeOrder = [this.themes.LIGHT, this.themes.DARK, this.themes.SYSTEM];
    const currentIndex = themeOrder.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;

    this.setTheme(themeOrder[nextIndex]);
  }

  setTheme(theme) {
    if (!Object.values(this.themes).includes(theme)) {
      console.warn('Invalid theme:', theme);
      return;
    }

    this.applyTheme(theme);
    this.updateThemeToggle();
  }

  updateThemeToggle() {
    const toggleButton = document.getElementById('theme-toggle');
    const toggleIcon = document.getElementById('theme-toggle-icon');
    const toggleText = document.getElementById('theme-toggle-text');

    if (!toggleButton || !toggleIcon) return;

    const icons = {
      [this.themes.LIGHT]: 'bi-sun-fill',
      [this.themes.DARK]: 'bi-moon-fill',
      [this.themes.SYSTEM]: 'bi-circle-half'
    };

    const labels = {
      [this.themes.LIGHT]: 'Light',
      [this.themes.DARK]: 'Dark',
      [this.themes.SYSTEM]: 'Auto'
    };

    // Update icon
    toggleIcon.className = `bi ${icons[this.currentTheme]}`;

    // Update text if element exists
    if (toggleText) {
      toggleText.textContent = labels[this.currentTheme];
    }

    // Update button title
    toggleButton.title = `Current theme: ${labels[this.currentTheme]}. Click to cycle themes.`;

    // Update button classes for styling
    toggleButton.className = toggleButton.className.replace(/btn-\w+/g, '');
    toggleButton.classList.add('btn', 'btn-outline-secondary');
  }

  getCurrentTheme() {
    return {
      userPreference: this.currentTheme,
      effective:
        this.currentTheme === this.themes.SYSTEM ? this.getSystemTheme() : this.currentTheme
    };
  }

  // Utility method to check if dark mode is active
  isDarkMode() {
    const current = this.getCurrentTheme();
    return current.effective === this.themes.DARK;
  }

  // Method to add theme-aware event listeners
  onThemeChange(callback) {
    if (typeof callback === 'function') {
      window.addEventListener('themechange', callback);
    }
  }

  // Method to remove theme change listeners
  offThemeChange(callback) {
    if (typeof callback === 'function') {
      window.removeEventListener('themechange', callback);
    }
  }
}

// Initialize theme manager when DOM is loaded
let themeManager;

function initThemeManager() {
  if (!themeManager) {
    themeManager = new ThemeManager();

    // Make it globally available
    window.themeManager = themeManager;

    // Add keyboard shortcut (Ctrl/Cmd + Shift + T)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        themeManager.toggleTheme();
      }
    });

    console.log('Theme Manager initialized. Current theme:', themeManager.getCurrentTheme());
  }

  return themeManager;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeManager);
} else {
  initThemeManager();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
