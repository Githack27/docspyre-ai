// Shared entity base — all persisted models extend this
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Navigation types — used by Sidebar across web and desktop
export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

// User types
export interface User extends BaseEntity {
  name: string;
  email: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  credits: number;
  maxCredits: number;
}

// Document types
export interface Document extends BaseEntity {
  title: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: number;
}
