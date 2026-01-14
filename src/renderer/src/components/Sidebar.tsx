import React from 'react';
import { Music, Star, BookOpen, LogOut } from 'lucide-react';
import { Icons } from './Icons';
import { useAuth } from '../context/AuthContext';
import styles from './Sidebar.module.css';

interface SidebarProps {
    onSearch: (query: string) => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    isOpen?: boolean;
    onClose?: () => void;
    onSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, onClose, onSettings }) => {
    const { logout } = useAuth();


    const navItems = [
        { id: 'all', label: 'My Library', icon: Music },
        { id: 'favorites', label: 'Favorites', icon: Star },
        { id: 'learning', label: 'Learning List', icon: BookOpen },
    ];

    return (
        <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <div className={styles.header}>
                <h2 className={styles.appName}>
                    <Music color="#bb86fc" /> Companion
                </h2>
                {onClose && (
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close sidebar">
                        <Icons.X size={24} />
                    </button>
                )}
            </div>


            <nav className={styles.nav}>
                {navItems.map(item => (
                    <div
                        key={item.id}
                        className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
                        onClick={() => setActiveTab(item.id)}
                    >
                        <item.icon size={18} />
                        <span>{item.label}</span>
                    </div>
                ))}
            </nav>

            <div className={styles.footer}>
                <div className={styles.navItem} onClick={() => onSettings && onSettings()}>
                    <Icons.Settings size={18} />
                    <span>Settings</span>
                </div>
                <div className={styles.navItem} onClick={() => logout()}>
                    <LogOut size={18} />
                    <span>Sign Out</span>
                </div>
            </div>
        </div>
    );
};
