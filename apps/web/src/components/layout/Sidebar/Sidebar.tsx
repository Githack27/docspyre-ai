'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

import type { NavSection } from '@/types';

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', href: '/home/dashboard', icon: 'dashboard' },
      { label: 'Docs', href: '/home/docs', icon: 'description' },
      { label: 'About', href: '/home/about', icon: 'info' },
      { label: 'Contact Us', href: '/home/contact', icon: 'mail' },
    ],
  },
  {
    heading: 'Document Tools',
    items: [
      { label: 'Document Conversion', href: '/document-tools/convert', icon: 'sync_alt' },
      { label: 'Document Writer', href: '/document-tools/writer', icon: 'edit_note' },
      { label: 'Document Formatter', href: '/document-tools/formatter', icon: 'format_align_left' },
      { label: 'OCR & Smart Scan', href: '/document-tools/ocr', icon: 'document_scanner' },
      { label: 'Template Marketplace', href: '/document-tools/templates', icon: 'library_books' },
    ],
  },
  {
    heading: 'Audio & Video',
    items: [
      { label: 'Audio & Video Transcription', href: '/audio-video/transcription', icon: 'mic' },
      { label: 'Document Translator', href: '/audio-video/translate', icon: 'translate' },
      { label: 'Audio Translator', href: '/audio-video/audio-translator', icon: 'record_voice_over' },
      { label: 'Video Translator', href: '/audio-video/video-translator', icon: 'subtitles' },
      { label: 'AI Communication Coach', href: '/audio-video/coach', icon: 'forum' },
    ],
  },
  {
    heading: 'Research & Academic',
    items: [
      { label: 'Resume Writer', href: '/research-academic/resume', icon: 'badge' },
      { label: 'Research and Journal Writing', href: '/research-academic/research', icon: 'science' },
      { label: 'Rephrase & AI detection', href: '/research-academic/rephrase', icon: 'find_replace' },
      { label: 'AI Citation Finder', href: '/research-academic/citations', icon: 'menu_book' },
      { label: 'AI Knowledge Base', href: '/research-academic/knowledge-base', icon: 'hub' },
    ],
  },
  {
    heading: 'AI Tools',
    items: [
      { label: 'Document Chat', href: '/ai-tools/doc-chat', icon: 'chat' },
      { label: 'Presentation Generator', href: '/ai-tools/presentation', icon: 'slideshow' },
      { label: 'AI Communication Writer', href: '/ai-tools/email-writer', icon: 'mail' },
      { label: 'Smart Document Comparison', href: '/ai-tools/compare', icon: 'compare' },
      { label: 'Workflow Automation', href: '/ai-tools/automation', icon: 'account_tree' },
      { label: 'Voice Document Assistant', href: '/ai-tools/voice-assistant', icon: 'settings_voice' },
      { label: 'AI Meeting Workspace', href: '/ai-tools/meetings', icon: 'video_camera_front' },
    ],
  },
  {
    heading: 'Legal & Enterprise',
    items: [
      { label: 'Contract and Legal Tool', href: '/legal-enterprise/legal', icon: 'gavel' },
      { label: 'Document Analytics', href: '/legal-enterprise/analytics', icon: 'bar_chart' },
      { label: 'Document Security', href: '/legal-enterprise/security', icon: 'verified_user' },
      { label: 'Industry AI agents', href: '/legal-enterprise/industry-agents', icon: 'precision_manufacturing' },
    ],
  },
];

interface SidebarProps {
  activeCategory: string;
}

export default function Sidebar({ activeCategory }: SidebarProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleThemeToggle = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const activeSection = NAV_SECTIONS.find((section) => section.heading === activeCategory) || NAV_SECTIONS[0];
  const items = activeSection?.items || [];

  return (
    <aside className={styles.sidebar} aria-label="Sidebar navigation">
      {/* Top Section: Compact theme switch */}
      <div className={styles.topSection}>
        <div className={styles.themeToggleContainer}>
          <button
            type="button"
            className={`${styles.themeBtn} ${theme === 'light' ? styles.themeActive : ''}`}
            onClick={() => handleThemeToggle('light')}
            aria-label="Light Mode"
          >
            <span className="material-symbols-outlined">light_mode</span>
          </button>
          <button
            type="button"
            className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeActive : ''}`}
            onClick={() => handleThemeToggle('dark')}
            aria-label="Dark Mode"
          >
            <span className="material-symbols-outlined">dark_mode</span>
          </button>
        </div>
      </div>

      {/* Center Section: Sub-navigation Icons */}
      <div className={styles.centerSection}>
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItemCircle} ${isActive ? styles.active : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className={styles.pillLabel}>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom Section: Billing & Logout actions */}
      <div className={styles.bottomSection}>
        <Link href="/billing" className={styles.actionIconCircle} aria-label="Billing & Payments">
          <span className="material-symbols-outlined">payments</span>
          <span className={styles.pillLabel}>Billing</span>
        </Link>
        <Link href="/logout" className={styles.actionIconCircle} aria-label="Logout">
          <span className="material-symbols-outlined">logout</span>
          <span className={styles.pillLabel}>Logout</span>
        </Link>
      </div>
    </aside>
  );
}
