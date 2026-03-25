import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import { API_BASE_URL } from '@/constants/api'

// Module-level tenant user ID — set by AuthContext, read by interceptor
let _tenantUserId: string | null = null

export function setTenantUserId(id: string | null) {
  _tenantUserId = id
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token and optional tenant header to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (_tenantUserId) config.headers['X-Tenant-User-Id'] = _tenantUserId
  return config
})

// On 401, clear tokens and let the app redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('access_token')
      await SecureStore.deleteItemAsync('refresh_token')
    }
    return Promise.reject(error)
  }
)
