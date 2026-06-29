import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/v1',
  withCredentials: true,
})

let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    // Don't attempt token refresh for auth endpoints (login/register/refresh themselves)
    const isAuthEndpoint = original.url?.includes('/auth/')
    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL ?? '/v1'}/auth/refresh`,
          {},
          { withCredentials: true },
        )
        setAccessToken(data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        setAccessToken(null)
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  },
)

export default api
