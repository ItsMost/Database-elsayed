import Dexie, { type Table } from 'dexie';
import type { Player, SyncAction, ExpectedAttendee, PersonalWalletEntry } from './types';

class SystemOfflineDB extends Dexie {
  players!: Table<Player, string>;
  syncQueue!: Table<SyncAction, number>;
  expectedToday!: Table<ExpectedAttendee, string>;
  personalWallet!: Table<PersonalWalletEntry, string>;

  constructor() {
    super('SystemPlayersOfflineDB');
    this.version(1).stores({
      players: 'id, number, name, sport, phone, isSystem, last_updated',
      syncQueue: '++id, playerId, action, timestamp',
    });
    this.version(2).stores({
      players: 'id, number, name, sport, phone, isSystem, last_updated',
      syncQueue: '++id, playerId, action, timestamp',
      expectedToday: '++id, name, sport, paid, subType, date',
    });
    this.version(3).stores({
      players: 'id, number, name, sport, phone, isSystem, last_updated',
      syncQueue: '++id, playerId, action, timestamp',
      expectedToday: '++id, name, sport, paid, subType, date, time',
    });
    this.version(4).stores({
      expectedToday: null, // Drop the table to allow keyPath schema change
    });
    this.version(5).stores({
      players: 'id, number, name, sport, phone, isSystem, last_updated',
      syncQueue: '++id, playerId, action, timestamp',
      expectedToday: 'id, name, sport, paid, subType, date, time', // Recreate with correct keyPath 'id'
    });
    this.version(6).stores({
      players: 'id, number, name, sport, phone, isSystem, last_updated',
      syncQueue: '++id, playerId, action, timestamp',
      expectedToday: 'id, name, sport, paid, subType, date, time',
      personalWallet: 'id, desc, amount, type, date, timestamp, last_updated',
    });
  }
}

export const db = new SystemOfflineDB();

/**
 * Migration Service: Safely copies existing data from old LocalStorage and native IndexedDB
 * into our new Dexie database on first load.
 */
export async function runMigration(): Promise<Player[]> {
  try {
    // 1. Check if Dexie already has players
    const count = await db.players.count();
    if (count > 0) {
      // Already migrated and initialized
      return await db.players.toArray();
    }

    console.log("Migration Service: Initializing migration...");
    const mergedPlayers = new Map<string, Player>();

    // 2. Fetch data from old LocalStorage
    try {
      const keys = ['coachPlayersData_v2', 'coachPlayersData'];
      for (const key of keys) {
        const lsData = localStorage.getItem(key);
        if (lsData) {
          const parsed = JSON.parse(lsData);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: Player) => {
              if (p && p.name) {
                const id = String(p.id || (Date.now() + Math.random()));
                mergedPlayers.set(id, { ...p, id, attendance: p.attendance || [], history: p.history || [] });
              }
            });
          }
        }
      }
    } catch (err) {
      console.error("Migration Service: Failed to read old localStorage", err);
    }

    // 3. Fetch data from old native IndexedDB ('SystemPlayersDB')
    try {
      const idbPlayers = await new Promise<Player[]>((resolve) => {
        const req = indexedDB.open("SystemPlayersDB", 1);
        req.onsuccess = (e) => {
          const nativeDb = (e.target as IDBOpenDBRequest).result;
          if (!nativeDb.objectStoreNames.contains("state")) {
            nativeDb.close();
            resolve([]);
            return;
          }
          try {
            const tx = nativeDb.transaction("state", "readonly");
            const store = tx.objectStore("state");
            const getReq = store.get("playersData");
            getReq.onsuccess = () => {
              nativeDb.close();
              resolve(Array.isArray(getReq.result) ? getReq.result : []);
            };
            getReq.onerror = () => {
              nativeDb.close();
              resolve([]);
            };
          } catch {
            nativeDb.close();
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      });

      idbPlayers.forEach((p) => {
        if (p && p.name) {
          const id = String(p.id || (Date.now() + Math.random()));
          const existing = mergedPlayers.get(id);
          // Only overwrite if native IDB data is newer, or if it doesn't exist in localstorage yet
          if (!existing || (p.last_updated || 0) > (existing.last_updated || 0)) {
            mergedPlayers.set(id, { ...p, id, attendance: p.attendance || [], history: p.history || [] });
          }
        }
      });
    } catch (err) {
      console.error("Migration Service: Failed to read old native IndexedDB", err);
    }

    const finalPlayers = Array.from(mergedPlayers.values());

    if (finalPlayers.length > 0) {
      console.log(`Migration Service: Migrating ${finalPlayers.length} players into Dexie...`);
      // Bulk insert into Dexie
      await db.players.bulkPut(finalPlayers);
      console.log("Migration Service: Migration completed successfully! ✅");
      return finalPlayers;
    }

    return [];
  } catch (error) {
    console.error("Migration Service: Fatal migration error", error);
    return [];
  }
}
