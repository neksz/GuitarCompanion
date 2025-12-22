import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { FileBrowser } from './features/FileBrowser';
import './assets/main.css'; // Assume we might want global styles or use inline

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f13' }}>
      <Sidebar
        onSearch={setSearchQuery}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <FileBrowser searchQuery={searchQuery} activeCategory={activeTab} />
      </main>
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
