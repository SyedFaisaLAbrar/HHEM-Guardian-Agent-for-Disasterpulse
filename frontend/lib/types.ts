export type Severity = 'high' | 'medium' | 'low' | 'unknown';

export interface CrisisEvent {
  id: string;
  text: string;
  disaster_type?: string;
  severity?: Severity;
  source?: string;
  timestamp?: string;
  locations?: string[];
  similarity?: number;
}

export interface Stats {
  total: number;
  high: number;
  medium: number;
  low: number;
}

export interface AnalysisReport {
  event_summary?: string;
  severity?: Severity;
  confidence?: 'high' | 'medium' | 'low';
  disaster_types?: string[];
  affected_locations?: string[];
  key_impacts?: string[];
  response_recommendations?: string[];
  data_sources?: string[];
}

export interface AnalysisResult {
  report: AnalysisReport;
  processing: {
    rag_hits?: number;
    vlm_used?: boolean;
  };
}
