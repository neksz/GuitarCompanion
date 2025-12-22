import React from 'react';
import { Music, Star, BookOpen, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './Sidebar.module.css';

interface SidebarProps {
    onSearch: (query: string) => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSearch, activeTab, setActiveTab }) => {
    const { logout } = useAuth();

    const navItems = [
        { id: 'all', label: 'All Tabs', icon: Music },
        { id: 'favorites', label: 'Favorites', icon: Star },
        { id: 'learning', label: 'Learning List', icon: BookOpen },
    ];

    return (
        <div className={styles.sidebar}>
            <div className={styles.header}>
                <h2 className={styles.appName}>
                    <Music color="#bb86fc" /> Companion
                </h2>
            </div>

            <div className={styles.searchContainer}>
                <input
                    type="text"
                    placeholder="Search tabs..."
                    className={styles.searchInput}
                    onChange={(e) => onSearch(e.target.value)}
                />
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
                <div className={styles.navItem} onClick={() => logout()}>
                    <LogOut size={18} />
                    <span>Sign Out</span>
                </div>
            </div>
        </div>
    );
};
