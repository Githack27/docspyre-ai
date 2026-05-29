'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import Sidebar, { NAV_SECTIONS } from '@/components/layout/Sidebar/Sidebar';
import ContentArea from '@/components/layout/ContentArea';
import styles from './ShellLayout.module.css';

interface ShellLayoutProps {
  children: React.ReactNode;
}

export default function ShellLayout({ children }: ShellLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>('Overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const activePillRef = useRef<HTMLDivElement>(null);
  const categoryNavRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Sync active category on mount or pathname change
  useEffect(() => {
    const matchedSection = NAV_SECTIONS.find((section) =>
      section.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    );
    if (matchedSection) {
      setActiveCategory(matchedSection.heading);
    } else {
      // Default to Overview if no match found
      setActiveCategory('Overview');
    }
  }, [pathname]);

  // Animate pill on category change
  useEffect(() => {
    const activeButton = buttonRefs.current[activeCategory];
    if (activeButton && activePillRef.current && categoryNavRef.current) {
      const buttonRect = activeButton.getBoundingClientRect();
      const navRect = categoryNavRef.current.getBoundingClientRect();
      
      const left = buttonRect.left - navRect.left - 4; // Subtract nav padding
      const width = buttonRect.width;
      
      gsap.to(activePillRef.current, {
        x: left,
        width: width,
        duration: 0.4,
        ease: 'power2.out',
      });
    }
  }, [activeCategory]);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleCategoryClick = (heading: string) => {
    setActiveCategory(heading);
    const section = NAV_SECTIONS.find((s) => s.heading === heading);
    const firstItem = section?.items?.[0];
    if (firstItem) {
      router.push(firstItem.href);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const toggleSection = (heading: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(heading)) {
      newExpanded.delete(heading);
    } else {
      newExpanded.add(heading);
    }
    setExpandedSections(newExpanded);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Search query:', searchQuery);
    // Implement search functionality here
  };

  return (
    <div className={styles.layoutWrapper}>
      {/* Top Navigation Bar */}
      <header className={styles.navbar} aria-label="Top navigation">
        {/* Mobile: Burger Menu */}
        <button 
          className={styles.burgerBtn} 
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
        >
          <span className="material-symbols-outlined">
            {isMobileMenuOpen ? 'close' : 'menu'}
          </span>
        </button>

        {/* Far-left: Logo Container with a subtle gray wrapped background */}
        <div className={styles.leftSection}>
          <div className={styles.logoWrapper}>
            <Image
              src="/images/Docspyre_logo.png"
              alt="DocSpyre Logo"
              width={42}
              height={42}
            />
            <div className={styles.logoText}>
              <span className={styles.logoPrimary}>DOCSPYRE</span>
              <span className={styles.logoSecondary}>AI Platform</span>
            </div>
          </div>
        </div>

        {/* Center: Horizontally aligned bordered navigation container occupying roughly half the navbar width */}
        <div className={styles.centerSection}>
          <nav className={styles.categoryNav} aria-label="Primary Categories" ref={categoryNavRef}>
            <div className={styles.activePill} ref={activePillRef} />
            {NAV_SECTIONS.map((section) => {
              const isActive = activeCategory === section.heading;
              return (
                <button
                  key={section.heading}
                  type="button"
                  ref={(el) => { buttonRefs.current[section.heading] = el; }}
                  className={`${styles.categoryBtn} ${isActive ? styles.activeCategory : ''}`}
                  onClick={() => handleCategoryClick(section.heading)}
                >
                  {section.heading}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Far-right: Two grouped areas (utility icons and user account behavior) */}
        <div className={styles.rightSection}>
          {/* Group 1: Search Form - Desktop */}
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <button type="submit" className={styles.searchBtn} aria-label="Search">
              <span className="material-symbols-outlined">search</span>
            </button>
          </form>

          {/* Mobile: Search Form */}
          <form onSubmit={handleSearchSubmit} className={styles.mobileSearchForm}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.mobileSearchInput}
            />
            <button type="submit" className={styles.mobileSearchBtn} aria-label="Search">
              <span className="material-symbols-outlined">search</span>
            </button>
          </form>

          {/* Group 2: User profile container */}
          <div className={styles.userWrapper}>
            <span className={`material-symbols-outlined ${styles.userIcon}`}>account_circle</span>
            <div className={styles.userText}>
              <span className={styles.userName}>John Doe</span>
              <span className={styles.userCredits}>Basic: 10/100 credits</span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <>
          <div className={styles.mobileMenuOverlay} onClick={toggleMobileMenu} />
          <div className={styles.mobileMenu}>
            {/* Logo Section with Close Button */}
            <div className={styles.mobileLogoSection}>
              <div className={styles.mobileLogoWrapper}>
                <Image
                  src="/images/Docspyre_logo.png"
                  alt="DocSpyre Logo"
                  width={32}
                  height={32}
                />
                <div className={styles.mobileLogoText}>
                  <span className={styles.mobileLogoPrimary}>DOCSPYRE</span>
                  <span className={styles.mobileLogoSecondary}>AI Platform</span>
                </div>
              </div>
              <button 
                className={styles.closeMenuBtn}
                onClick={toggleMobileMenu}
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Navigation Sections */}
            <nav className={styles.mobileNav}>
              {NAV_SECTIONS.map((section) => (
                <div key={section.heading} className={styles.mobileNavSection}>
                  <button
                    className={styles.mobileNavHeading}
                    onClick={() => toggleSection(section.heading)}
                  >
                    {section.heading}
                  </button>
                  {expandedSections.has(section.heading) && (
                    <div className={styles.mobileNavItems}>
                      {section.items.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.mobileNavItem} ${isActive ? styles.mobileNavItemActive : ''}`}
                          >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* User Info Section - Moved to Bottom */}
            <div className={styles.mobileUserSection}>
              <div className={styles.mobileUserWrapper}>
                <span className={`material-symbols-outlined ${styles.mobileUserIcon}`}>account_circle</span>
                <div className={styles.mobileUserText}>
                  <span className={styles.mobileUserName}>John Doe</span>
                  <span className={styles.mobileUserCredits}>Basic: 10/100 credits</span>
                </div>
              </div>
              <div className={styles.mobileActions}>
                <Link href="/billing" className={styles.mobileActionBtn}>
                  <span className="material-symbols-outlined">payments</span>
                  <span>Billing</span>
                </Link>
                <Link href="/logout" className={styles.mobileActionBtn}>
                  <span className="material-symbols-outlined">logout</span>
                  <span>Logout</span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Content Area with Sidebar */}
      <div className={styles.bodyWrapper}>
        <Sidebar activeCategory={activeCategory} />
        <ContentArea>{children}</ContentArea>
      </div>
    </div>
  );
}
