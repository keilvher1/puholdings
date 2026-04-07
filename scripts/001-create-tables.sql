-- PU Holdings Database Schema

-- Portfolio companies table
CREATE TABLE IF NOT EXISTS portfolio_companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  category VARCHAR(100) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  image_url VARCHAR(500),
  website VARCHAR(500),
  investment_year INTEGER,
  status VARCHAR(50) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- News / Notices table
CREATE TABLE IF NOT EXISTS news (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  content TEXT,
  category VARCHAR(100) DEFAULT '일반',
  image_url VARCHAR(500),
  published_at DATE NOT NULL DEFAULT CURRENT_DATE,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Company statistics table
CREATE TABLE IF NOT EXISTS statistics (
  id SERIAL PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  value INTEGER NOT NULL,
  suffix VARCHAR(50) DEFAULT '',
  prefix VARCHAR(50) DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact inquiries table
CREATE TABLE IF NOT EXISTS inquiries (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  message TEXT,
  status VARCHAR(50) DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
