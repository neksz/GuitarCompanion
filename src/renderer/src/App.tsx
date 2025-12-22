import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { FileBrowser } from './features/FileBrowser';

import './assets/main.css'; // Assume we might want global styles or use inline

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <FileBrowser
          searchQuery={searchQuery}
          activeCategory={activeCategory}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onSearch={setSearchQuery}
        />
      </main>
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
            display: 'none'
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
