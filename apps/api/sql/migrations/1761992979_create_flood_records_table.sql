-- Migration: create_flood_records_table
-- Created at: 1761992979

-- Create flood_records table with all 27 fields
CREATE TABLE flood_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  forecast_date TIMESTAMPTZ,
  issue_date TIMESTAMPTZ NOT NULL,
  lead_time INTEGER,
  region TEXT,
  country TEXT NOT NULL,
  specific_location TEXT,
  bbox JSONB,
  source_url TEXT,
  title TEXT,
  description TEXT,
  severity TEXT,
  confidence FLOAT,
  coordinates JSONB,
  affected_population INTEGER,
  economic_impact FLOAT,
  infrastructure_affected TEXT,
  casualties INTEGER,
  evacuations INTEGER,
  emergency_response TEXT,
  recovery_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT,
  tags JSONB
);

-- Create indexes for common queries
CREATE INDEX idx_flood_records_issue_date ON flood_records(issue_date DESC);
CREATE INDEX idx_flood_records_country ON flood_records(country);
CREATE INDEX idx_flood_records_type ON flood_records(type);
CREATE INDEX idx_flood_records_status ON flood_records(status);

-- Enable RLS
ALTER TABLE flood_records ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for public access (reading)
CREATE POLICY "Allow public read access" ON flood_records
  FOR SELECT
  USING (true);

-- Create RLS policy for insert via edge functions
CREATE POLICY "Allow insert via edge function" ON flood_records
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

-- Create RLS policy for update via edge functions  
CREATE POLICY "Allow update via edge function" ON flood_records
  FOR UPDATE
  USING (auth.role() IN ('anon', 'service_role'))
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

-- Create RLS policy for delete via edge functions
CREATE POLICY "Allow delete via edge function" ON flood_records
  FOR DELETE
  USING (auth.role() IN ('anon', 'service_role'));

