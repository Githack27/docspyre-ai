import React from 'react';
import styles from './ContentArea.module.css';

interface ContentAreaProps {
  children: React.ReactNode;
}

export default function ContentArea({ children }: ContentAreaProps) {
  return (
    <main className={styles.contentArea} id="main-content">
      {children}
    </main>
  );
}
