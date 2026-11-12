import axios from 'axios'

const AUTH_KEY = 'pbhero_admin_auth'

// Initialize Axios defaults
axios.defaults.withCredentials = true

// Setup Request Interceptor to automatically attach credentials
axios.interceptors.request.use((config) => {
    try {
        const savedAuth = localStorage.getItem(AUTH_KEY)
        if (savedAuth && !config.headers['Authorization']) {
            config.headers['Authorization'] = `Basic ${savedAuth}`
            config.headers['X-Admin-Token'] = savedAuth
        }
    } catch (e) {
        // ignore localStorage access errors
    }
    return config
}, (error) => Promise.reject(error))

export function setAdminAuth(password) {
    if (!password) return
    const encoded = btoa(`admin:${password.trim()}`)
    localStorage.setItem(AUTH_KEY, encoded)
    axios.defaults.headers.common['Authorization'] = `Basic ${encoded}`
    axios.defaults.headers.common['X-Admin-Token'] = encoded
    window.dispatchEvent(new CustomEvent('pbhero:auth_changed', { detail: { authenticated: true } }))
}

export function clearAdminAuth() {
    localStorage.removeItem(AUTH_KEY)
    delete axios.defaults.headers.common['Authorization']
    delete axios.defaults.headers.common['X-Admin-Token']
    window.dispatchEvent(new CustomEvent('pbhero:auth_changed', { detail: { authenticated: false } }))
}

export function getAdminAuth() {
    try {
        return localStorage.getItem(AUTH_KEY)
    } catch {
        return null
    }
}

export function hasAdminAuth() {
    return !!getAdminAuth()
}

