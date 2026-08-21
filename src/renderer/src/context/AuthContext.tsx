import React, { createContext, useContext, useState, useEffect } from 'react'
import { ILoginCredentials } from '../../../shared/types'
import { api } from '../services/api'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: (creds: ILoginCredentials) => Promise<void>
  logout: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const result = await api.checkAuth()
      setIsAuthenticated(result)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (creds: ILoginCredentials) => {
    setError(null)
    try {
      const res = await api.login(creds)
      if (res.success) {
        setIsAuthenticated(true)
      } else {
        setError(res.error || 'Login failed')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      // setIsLoading(false); // Removed as per instruction
    }
  }

  const logout = async () => {
    await api.logout()
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
