export interface HistoryEntry {
  desc: string;
  cost: number;
  paid: number;
  date: string;
  timestamp: number;
  subType: string;
}

export interface Player {
  id: string; // Stored as a string to match Supabase's PK type
  number?: string;
  name: string;
  birthYear?: string | number;
  sport?: string;
  club?: string;
  phone?: string;
  height?: string | number;
  weight?: string | number;
  fat?: string | number;
  muscle?: string | number;
  subType?: string;
  startDate?: string;
  paid?: number;
  cost?: number;
  attendance?: string[];
  history?: HistoryEntry[];
  isSystem?: boolean; // True for system configurations like general expenses
  last_updated?: number;
}

export interface SyncAction {
  id?: number; // Auto-incremented local queue ID
  playerId: string;
  action: 'save' | 'delete';
  playerData?: Player; // Holds full player data for delayed saves
  timestamp: number;
}

export interface ExpectedAttendee {
  id?: number; // Auto-incremented local ID
  name: string;
  sport: string;
  paid: number;
  subType: string;
  date: string;
}

