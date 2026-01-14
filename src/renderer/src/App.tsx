import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { FileBrowser } from './features/FileBrowser';
import { SettingsModal } from './features/SettingsModal';

import './assets/main.css'; // Assume we might want global styles or use inline

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', background: '#0f0f13', flexDirection: 'row' }}>
      <Sidebar
        onSearch={setSearchQuery}
        activeTab={activeCategory}
        setActiveTab={(tab) => {
          setActiveCategory(tab);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSettings={() => {
          setIsSidebarOpen(false); // Close sidebar on mobile/if needed
          setIsSettingsOpen(true);
        }}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <FileBrowser
          searchQuery={searchQuery}
          activeCategory={activeCategory}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onSearch={setSearchQuery}
          refreshTrigger={isSettingsOpen ? 0 : 1} // Trick to force refresh if needed, but better to expose a refresh method? 
        // Actually, SettingsModal handles save. FileBrowser might need to know to re-fetch settings? 
        // FileBrowser fetches settings on mount. Maybe a key change or a context?
        />
        {/* We need to pass a signal to FileBrowser to reload settings if they changed. 
            Or FileBrowser can listen to an event? Or simply passing a prop `lastSettingsUpdate` timestamp 
        */}
      </main>

      {isSettingsOpen && (
        <React.Suspense fallback={null}>
          {/* Lazy load if we wanted, but valid import for now */}
          <SettingsModal
            onClose={() => setIsSettingsOpen(false)}
            onSave={() => {
              // Trigger refresh in FileBrowser?
              // Ideally we pass a callback or update a context.
              // For now, let's just reload window or assume next mount fixes it? 
              // No, user expects immediate update.
              window.location.reload(); // Simple but effective for global settings change
            }}
          />
        </React.Suspense>
      )}

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
  );
};


const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div style={{
      height: '100vh',
      background: '#0f0f13',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }}>Loading...</div>;
  }

  return isAuthenticated ? <MainLayout /> : <Login />;
};

export default function App(): React.ReactElement {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
