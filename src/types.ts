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
  position?: string; // Player position on field (e.g. forward, playmaker)
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
  isDeleted?: boolean; // True if the player is soft-deleted/archived
  last_updated?: number;
}

export interface SyncAction {
  id?: number; // Auto-incremented local queue ID
  playerId: string;
  action: 'save' | 'delete' | 'save_expected' | 'delete_expected' | 'save_wallet' | 'delete_wallet';
  playerData?: Player; // Holds full player data for delayed saves
  timestamp: number;
}

export interface ExpectedAttendee {
  id: string; // Stored as a string to match Supabase's PK type
  name: string;
  sport: string;
  paid: number;
  subType: string;
  date: string;
  time?: string; // Expected arrival time (e.g. "17:00")
  playerId?: string; // Link to existing player if chosen from database
  last_updated?: number;
  isDeleted?: boolean; // True if soft-deleted/registered/archived
}

export interface PersonalWalletEntry {
  id: string;
  desc: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  timestamp: number;
  last_updated?: number;
  isDeleted?: boolean;
}

