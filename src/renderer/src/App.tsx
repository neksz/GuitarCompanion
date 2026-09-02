import React, { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './components/Login'
import { Sidebar } from './components/Sidebar'
import { FileBrowser } from './features/FileBrowser'
import { StatisticsPage } from './features/StatisticsPage'
import { SettingsModal } from './features/SettingsModal'
import { MetronomeModal } from './features/MetronomeModal'
import { useMetronomeStore } from './utils/useMetronomeStore'

import './assets/main.css' // Assume we might want global styles or use inline

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsVersion, setSettingsVersion] = useState(0)

  // Global key shortcut for metronome (M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const activeTag = document.activeElement?.tagName
      if (
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return
      }

      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isSettingsOpen) {
          e.preventDefault()
          useMetronomeStore.getState().toggleOpen()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsOpen])

  return (
    <div
      className="app-container"
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: '#0f0f13',
        flexDirection: 'row'
      }}
    >
      <Sidebar
        onSearch={setSearchQuery}
        activeTab={activeCategory}
        setActiveTab={(tab) => {
          setActiveCategory(tab)
          setIsSidebarOpen(false)
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSettings={() => {
          setIsSidebarOpen(false) // Close sidebar on mobile/if needed
          setIsSettingsOpen(true)
        }}
        onMetronome={() => {
          setIsSidebarOpen(false)
          useMetronomeStore.getState().open()
        }}
      />
      <main
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          minWidth: 0
        }}
      >
        {activeCategory === 'statistics' ? (
          <StatisticsPage onOpenSidebar={() => setIsSidebarOpen(true)} />
        ) : (
          <FileBrowser
            searchQuery={searchQuery}
            activeCategory={activeCategory}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onSearch={setSearchQuery}
            refreshTrigger={settingsVersion}
          />
        )}
      </main>

      {isSettingsOpen && (
        <React.Suspense fallback={null}>
          <SettingsModal
            onClose={() => setIsSettingsOpen(false)}
            onSave={() => {
              setSettingsVersion((v) => v + 1)
            }}
          />
        </React.Suspense>
      )}

      <MetronomeModal />

      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 950,
            display: 'none' // This logic seems flawed in original code if it depends on css media queries
          }}
        />
      )}
    </div>
  )
}

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          background: '#0f0f13',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff'
        }}
      >
        Loading...
      </div>
    )
  }

  return isAuthenticated ? <MainLayout /> : <Login />
}

export default function App(): React.ReactElement {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
