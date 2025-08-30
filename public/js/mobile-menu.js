// Mobile Menu Handler
document.addEventListener('DOMContentLoaded', function() {
    // Create mobile menu toggle button
    const createMobileMenuToggle = () => {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        
        // Check if we're on mobile
        if (window.innerWidth <= 768) {
            // Check if toggle already exists
            if (!document.getElementById('mobileMenuToggle')) {
                const navContainer = navbar.querySelector('.container-fluid');
                const navBrand = navbar.querySelector('.navbar-brand');
                const navActions = navbar.querySelector('.d-flex');
                
                // Create toggle button
                const toggleBtn = document.createElement('button');
                toggleBtn.id = 'mobileMenuToggle';
                toggleBtn.className = 'btn btn-outline-primary ms-auto';
                toggleBtn.innerHTML = '<i class="bi bi-list"></i>';
                toggleBtn.style.padding = '0.25rem 0.5rem';
                toggleBtn.setAttribute('aria-label', 'Toggle navigation menu');
                
                // Create wrapper for brand and toggle
                const headerWrapper = document.createElement('div');
                headerWrapper.className = 'd-flex justify-content-between align-items-center w-100';
                headerWrapper.appendChild(navBrand);
                headerWrapper.appendChild(toggleBtn);
                
                // Wrap nav actions in collapsible div
                const navCollapse = document.createElement('div');
                navCollapse.id = 'navbarCollapse';
                navCollapse.className = 'navbar-collapse collapse w-100';
                navCollapse.appendChild(navActions);
                
                // Clear and rebuild container
                navContainer.innerHTML = '';
                navContainer.appendChild(headerWrapper);
                navContainer.appendChild(navCollapse);
                
                // Add toggle functionality
                toggleBtn.addEventListener('click', () => {
                    const isExpanded = navCollapse.classList.contains('show');
                    if (isExpanded) {
                        navCollapse.classList.remove('show');
                        toggleBtn.innerHTML = '<i class="bi bi-list"></i>';
                    } else {
                        navCollapse.classList.add('show');
                        toggleBtn.innerHTML = '<i class="bi bi-x"></i>';
                    }
                });
            }
        }
    };
    
    // Initialize on load
    createMobileMenuToggle();
    
    // Reinitialize on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Reload page on significant resize to reset layout
            if ((window.innerWidth <= 768 && !document.getElementById('mobileMenuToggle')) ||
                (window.innerWidth > 768 && document.getElementById('mobileMenuToggle'))) {
                location.reload();
            }
        }, 250);
    });
    
    // Improve touch scrolling for tabs
    const tabContainers = document.querySelectorAll('.nav-tabs');
    tabContainers.forEach(container => {
        if (window.innerWidth <= 768) {
            container.style.overflowX = 'auto';
            container.style.webkitOverflowScrolling = 'touch';
            container.style.scrollbarWidth = 'thin';
        }
    });
    
    // Make tables responsive
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        if (!table.parentElement.classList.contains('table-responsive')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-responsive';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }
    });
    
    // Improve file/app selection on mobile
    if ('ontouchstart' in window) {
        // Add touch feedback
        document.querySelectorAll('.file-item, .app-item, .tool-card').forEach(item => {
            item.addEventListener('touchstart', function() {
                this.style.opacity = '0.7';
            });
            item.addEventListener('touchend', function() {
                this.style.opacity = '1';
            });
        });
        
        // Prevent accidental selections
        let touchStartTime;
        document.addEventListener('touchstart', () => {
            touchStartTime = Date.now();
        });
        
        document.querySelectorAll('.file-checkbox, .app-checkbox').forEach(checkbox => {
            checkbox.addEventListener('touchend', (e) => {
                const touchDuration = Date.now() - touchStartTime;
                if (touchDuration < 150) {
                    // Too quick, might be accidental
                    e.preventDefault();
                }
            });
        });
    }
    
    // Add keyboard navigation support
    const addKeyboardNav = () => {
        // Tab navigation with arrow keys
        const tabs = document.querySelectorAll('.nav-link');
        tabs.forEach((tab, index) => {
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight' && tabs[index + 1]) {
                    tabs[index + 1].focus();
                    tabs[index + 1].click();
                } else if (e.key === 'ArrowLeft' && tabs[index - 1]) {
                    tabs[index - 1].focus();
                    tabs[index - 1].click();
                }
            });
        });
    };
    
    addKeyboardNav();
    
    // Improve form inputs on mobile
    const inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
    inputs.forEach(input => {
        // Add clear button for mobile
        if (window.innerWidth <= 768 && input.type === 'search') {
            const clearBtn = document.createElement('button');
            clearBtn.className = 'btn btn-sm btn-link position-absolute';
            clearBtn.innerHTML = '<i class="bi bi-x-circle"></i>';
            clearBtn.style.right = '10px';
            clearBtn.style.top = '50%';
            clearBtn.style.transform = 'translateY(-50%)';
            clearBtn.style.zIndex = '10';
            clearBtn.onclick = () => {
                input.value = '';
                input.dispatchEvent(new Event('input'));
            };
            
            const wrapper = input.parentElement;
            wrapper.style.position = 'relative';
            wrapper.appendChild(clearBtn);
        }
    });
});

// Add CSS for navbar collapse animation
const style = document.createElement('style');
style.textContent = `
    .navbar-collapse {
        transition: all 0.3s ease;
    }
    
    .navbar-collapse.collapse:not(.show) {
        display: none;
    }
    
    .navbar-collapse.collapse.show {
        display: block !important;
        padding-top: 1rem;
    }
    
    @media (max-width: 768px) {
        .navbar-collapse .d-flex {
            flex-direction: column !important;
            align-items: stretch !important;
        }
        
        .navbar-collapse .btn {
            margin: 0.25rem 0 !important;
            width: 100%;
        }
        
        #mobileMenuToggle {
            display: block !important;
        }
    }
    
    @media (min-width: 769px) {
        #mobileMenuToggle {
            display: none !important;
        }
        
        .navbar-collapse {
            display: block !important;
        }
    }
`;
document.head.appendChild(style);